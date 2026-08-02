const express = require('express');
const multer = require('multer');
const svc = require('../inventory/service');
const salesImport = require('../inventory/salesImport');
const stockSync = require('../inventory/stockSync');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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

function handleAsync(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
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

// 이지어드민 등에서 내려받은 판매내역 파일(csv/xlsx) 업로드 -> SKU별 판매수량 집계 -> 재고 차감(세트는 구성품까지 연쇄 차감)
// 1) POST /sales-import/upload (multipart 'file') - 업로드 후 기본 미리보기 반환
// 2) GET  /sales-import/:uploadId/preview?sheetIndex=&headerRow= - 헤더행/시트를 바꿔가며 다시 미리보기
// 3) POST /sales-import/:uploadId/commit - 컬럼 매핑을 확정해 실제 반영
router.post(
  '/sales-import/upload',
  upload.single('file'),
  handleAsync(async (req, res) => {
    if (!req.file) throw new svc.InventoryError('업로드할 파일을 선택하세요.');
    const uploadId = salesImport.registerUpload(req.file.buffer, req.file.originalname);
    res.status(201).json(await salesImport.preview(uploadId));
  })
);

router.get(
  '/sales-import/:uploadId/preview',
  handleAsync(async (req, res) => {
    const { sheetIndex, headerRow } = req.query;
    res.json(await salesImport.preview(req.params.uploadId, { sheetIndex, headerRow }));
  })
);

router.post(
  '/sales-import/:uploadId/commit',
  handleAsync(async (req, res) => {
    res.json(await salesImport.commit(req.params.uploadId, req.body || {}));
  })
);

// 이지어드민 "재고 현황" 다운로드 파일(정상재고 스냅샷) 업로드 -> 반영 계획 미리보기 -> 확정 시 SKU별 재고를 파일 값으로 덮어씀
// (등록 안 된 SKU는 자동 등록). 판매내역 차감과 달리 절대값 동기화이며, 세트 SKU도 파일 값이 그대로 반영된다.
// 1) POST /stock-sync/upload (multipart 'file') - 업로드 후 반영 계획(plan) 반환
// 2) POST /stock-sync/:uploadId/commit - 계획을 확정해 실제 반영
router.post(
  '/stock-sync/upload',
  upload.single('file'),
  handleAsync(async (req, res) => {
    if (!req.file) throw new svc.InventoryError('업로드할 파일을 선택하세요.');
    res.status(201).json(await stockSync.upload(req.file.buffer, req.file.originalname));
  })
);

router.post(
  '/stock-sync/:uploadId/commit',
  handle((req, res) => {
    res.json(stockSync.commit(req.params.uploadId));
  })
);

module.exports = router;
