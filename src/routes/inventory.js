const express = require('express');
const svc = require('../inventory/service');

const router = express.Router();

function handle(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      if (e instanceof svc.InventoryError) {
        res.status(e.status).json({ error: e.message });
      } else {
        res.status(500).json({ error: e.message });
      }
    }
  };
}

// GET /api/inventory/products?q=&type=set|component&low=1
router.get(
  '/products',
  handle((req, res) => {
    const { q, type, low } = req.query;
    res.json({ results: svc.listProducts({ q, type, low }) });
  })
);

router.post(
  '/products',
  handle((req, res) => {
    res.status(201).json(svc.createProduct(req.body));
  })
);

router.get(
  '/products/:id',
  handle((req, res) => {
    const product = svc.toProductDto(svc.requireProductRow(req.params.id));
    const bom = product.isSet ? svc.listBom(product.id) : [];
    const usedInSets = svc.usedInSets(product.id);
    res.json({ ...product, bom, usedInSets });
  })
);

router.put(
  '/products/:id',
  handle((req, res) => {
    res.json(svc.updateProduct(req.params.id, req.body));
  })
);

router.delete(
  '/products/:id',
  handle((req, res) => {
    svc.deleteProduct(req.params.id);
    res.status(204).end();
  })
);

router.get(
  '/products/:id/bom',
  handle((req, res) => {
    res.json({ results: svc.listBom(req.params.id) });
  })
);

// POST /api/inventory/products/:id/bom { componentProductId, quantity }
router.post(
  '/products/:id/bom',
  handle((req, res) => {
    const { componentProductId, quantity } = req.body || {};
    res.status(201).json({ results: svc.addBomItem(req.params.id, componentProductId, quantity) });
  })
);

router.delete(
  '/bom/:bomItemId',
  handle((req, res) => {
    res.json({ results: svc.removeBomItem(req.params.bomItemId) });
  })
);

// GET /api/inventory/products/:id/expand?quantity= - 세트 N개를 만드는데 필요한 최하위 단품 총수량 미리보기
router.get(
  '/products/:id/expand',
  handle((req, res) => {
    res.json({ results: svc.previewExpansion(req.params.id, req.query.quantity || 1) });
  })
);

// POST /api/inventory/products/:id/sell { quantity, memo } - 판매 처리(세트면 구성 단품까지 연쇄 차감)
router.post(
  '/products/:id/sell',
  handle((req, res) => {
    const { quantity, memo } = req.body || {};
    res.json(svc.sellProduct(req.params.id, quantity, memo));
  })
);

// POST /api/inventory/products/:id/adjust { delta, reason, memo } - 입고/수동 조정
router.post(
  '/products/:id/adjust',
  handle((req, res) => {
    const { delta, reason, memo } = req.body || {};
    res.json(svc.adjustStock(req.params.id, delta, reason, memo));
  })
);

router.get(
  '/products/:id/movements',
  handle((req, res) => {
    res.json({ results: svc.listMovements(req.params.id, req.query.limit) });
  })
);

router.get(
  '/reorder-alerts',
  handle((req, res) => {
    res.json({ results: svc.reorderAlerts() });
  })
);

module.exports = router;
