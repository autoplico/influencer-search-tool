// 재고 관리 핵심 로직
// - 세트상품 판매 시 구성 단품(하위 재고)을 자동으로 차감 (BOM = Bill of Materials)
// - 세트 안에 세트가 중첩된 경우도 재귀적으로 펼쳐서 최하위 단품까지 차감
// - 판매되지 않는 부자재(예: 오일파스텔 도구세트의 홀더/스틱)도 재고만 추적 가능
const db = require('../db');

class InventoryError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function toProductDto(row) {
  if (!row) return row;
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    category: row.category,
    isSet: !!row.is_set,
    isSellable: !!row.is_sellable,
    unit: row.unit,
    stockQty: row.stock_qty,
    reorderPoint: row.reorder_point,
    lowStock: row.reorder_point !== null && row.stock_qty <= row.reorder_point,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getProductRow(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function requireProductRow(id) {
  const row = getProductRow(id);
  if (!row) throw new InventoryError('품목을 찾을 수 없습니다.', 404);
  return row;
}

function listProducts({ q, type, low } = {}) {
  let rows = db.prepare('SELECT * FROM products ORDER BY is_set DESC, name ASC').all();

  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter(
      (r) => r.name.toLowerCase().includes(needle) || r.sku.toLowerCase().includes(needle)
    );
  }
  if (type === 'set') rows = rows.filter((r) => r.is_set);
  if (type === 'component') rows = rows.filter((r) => !r.is_set);
  if (low === true || low === '1' || low === 'true') {
    rows = rows.filter((r) => r.reorder_point !== null && r.stock_qty <= r.reorder_point);
  }

  return rows.map(toProductDto);
}

function createProduct(data) {
  const { sku, name, category, isSet, isSellable, unit, stockQty, reorderPoint, notes } = data || {};
  if (!sku || !String(sku).trim()) throw new InventoryError('sku는 필수입니다.');
  if (!name || !String(name).trim()) throw new InventoryError('name은 필수입니다.');

  try {
    const info = db
      .prepare(
        `INSERT INTO products (sku, name, category, is_set, is_sellable, unit, stock_qty, reorder_point, notes, updated_at)
         VALUES (@sku, @name, @category, @isSet, @isSellable, @unit, @stockQty, @reorderPoint, @notes, datetime('now'))`
      )
      .run({
        sku: String(sku).trim(),
        name: String(name).trim(),
        category: category || null,
        isSet: isSet ? 1 : 0,
        isSellable: isSellable === false || isSellable === 0 || isSellable === '0' ? 0 : 1,
        unit: unit || '개',
        stockQty: Number.isFinite(Number(stockQty)) ? Math.trunc(Number(stockQty)) : 0,
        reorderPoint: reorderPoint === undefined || reorderPoint === null || reorderPoint === '' ? null : Math.trunc(Number(reorderPoint)),
        notes: notes || null,
      });

    const row = getProductRow(info.lastInsertRowid);
    if (row.stock_qty !== 0) {
      recordMovement(row.id, row.stock_qty, 'initial', '초기 재고 등록');
    }
    return toProductDto(row);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new InventoryError('이미 등록된 SKU입니다.', 409);
    throw e;
  }
}

function updateProduct(id, data) {
  const existing = requireProductRow(id);
  const merged = {
    id: existing.id,
    sku: data.sku !== undefined ? String(data.sku).trim() : existing.sku,
    name: data.name !== undefined ? String(data.name).trim() : existing.name,
    category: data.category !== undefined ? data.category || null : existing.category,
    is_set: data.isSet !== undefined ? (data.isSet ? 1 : 0) : existing.is_set,
    is_sellable: data.isSellable !== undefined ? (data.isSellable ? 1 : 0) : existing.is_sellable,
    unit: data.unit !== undefined ? data.unit || '개' : existing.unit,
    reorder_point:
      data.reorderPoint !== undefined
        ? data.reorderPoint === null || data.reorderPoint === ''
          ? null
          : Math.trunc(Number(data.reorderPoint))
        : existing.reorder_point,
    notes: data.notes !== undefined ? data.notes || null : existing.notes,
  };

  try {
    db.prepare(
      `UPDATE products SET
        sku = @sku, name = @name, category = @category, is_set = @is_set,
        is_sellable = @is_sellable, unit = @unit, reorder_point = @reorder_point,
        notes = @notes, updated_at = datetime('now')
       WHERE id = @id`
    ).run(merged);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new InventoryError('이미 등록된 SKU입니다.', 409);
    throw e;
  }

  return toProductDto(getProductRow(id));
}

function deleteProduct(id) {
  requireProductRow(id);
  const usedAsParent = db.prepare('SELECT COUNT(*) c FROM bom_items WHERE parent_product_id = ?').get(id).c;
  const usedAsComponent = db.prepare('SELECT COUNT(*) c FROM bom_items WHERE component_product_id = ?').get(id).c;
  if (usedAsParent > 0) throw new InventoryError('세트 구성이 남아있습니다. 먼저 구성을 비워주세요.', 409);
  if (usedAsComponent > 0) throw new InventoryError('다른 세트의 구성품으로 사용 중입니다. 먼저 해당 세트에서 제외해주세요.', 409);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
}

// component 제품(componentId)이 candidateAncestorId를 하위 어딘가에 포함하고 있으면 true (순환 방지용)
function isDescendantOf(componentId, candidateAncestorId, visited = new Set()) {
  if (componentId === candidateAncestorId) return true;
  if (visited.has(componentId)) return false;
  visited.add(componentId);
  const children = db.prepare('SELECT component_product_id FROM bom_items WHERE parent_product_id = ?').all(componentId);
  return children.some((c) => isDescendantOf(c.component_product_id, candidateAncestorId, visited));
}

function listBom(parentId) {
  requireProductRow(parentId);
  const rows = db
    .prepare(
      `SELECT b.id, b.parent_product_id, b.component_product_id, b.quantity, p.sku, p.name, p.unit, p.stock_qty, p.is_sellable
       FROM bom_items b JOIN products p ON p.id = b.component_product_id
       WHERE b.parent_product_id = ?
       ORDER BY p.name ASC`
    )
    .all(parentId);
  return rows.map((r) => ({
    bomItemId: r.id,
    componentProductId: r.component_product_id,
    sku: r.sku,
    name: r.name,
    unit: r.unit,
    quantityPerSet: r.quantity,
    currentStock: r.stock_qty,
    isSellable: !!r.is_sellable,
  }));
}

function addBomItem(parentId, componentId, quantity) {
  const parent = requireProductRow(parentId);
  const component = requireProductRow(componentId);
  if (!parent.is_set) throw new InventoryError('세트(is_set=true) 품목에만 구성품을 추가할 수 있습니다.');
  if (parent.id === component.id) throw new InventoryError('자기 자신을 구성품으로 추가할 수 없습니다.');
  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new InventoryError('quantity는 1 이상의 숫자여야 합니다.');

  if (component.is_set && isDescendantOf(parent.id, component.id)) {
    throw new InventoryError('순환 참조가 발생하는 구성입니다 (세트가 자기 자신을 간접 포함).');
  }

  try {
    db.prepare(
      `INSERT INTO bom_items (parent_product_id, component_product_id, quantity)
       VALUES (?, ?, ?)
       ON CONFLICT(parent_product_id, component_product_id) DO UPDATE SET quantity = excluded.quantity`
    ).run(parentId, componentId, qty);
  } catch (e) {
    throw new InventoryError(e.message);
  }

  return listBom(parentId);
}

function removeBomItem(bomItemId) {
  const row = db.prepare('SELECT * FROM bom_items WHERE id = ?').get(bomItemId);
  if (!row) throw new InventoryError('구성 항목을 찾을 수 없습니다.', 404);
  db.prepare('DELETE FROM bom_items WHERE id = ?').run(bomItemId);
  return listBom(row.parent_product_id);
}

// productId 1개(=multiplier)를 만드는 데 필요한 최하위 단품 수량을 재귀적으로 집계
// (세트 안에 세트가 있어도 끝까지 펼쳐서 반환: Map<componentProductId, totalQty>)
function expandComponents(productId, multiplier, acc = new Map(), visited = new Set()) {
  if (visited.has(productId)) throw new InventoryError('세트 구성에 순환 참조가 있습니다.');
  visited.add(productId);

  const children = db.prepare('SELECT component_product_id, quantity FROM bom_items WHERE parent_product_id = ?').all(productId);
  for (const child of children) {
    const childTotal = child.quantity * multiplier;
    const childProduct = getProductRow(child.component_product_id);
    if (childProduct && childProduct.is_set) {
      expandComponents(child.component_product_id, childTotal, acc, new Set(visited));
    } else {
      acc.set(child.component_product_id, (acc.get(child.component_product_id) || 0) + childTotal);
    }
  }
  return acc;
}

function recordMovement(productId, changeQty, reason, refNote) {
  const balance = getProductRow(productId).stock_qty;
  db.prepare(
    `INSERT INTO stock_movements (product_id, change_qty, balance_after, reason, ref_note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(productId, changeQty, balance, reason, refNote || null);
}

function applyStockChange(productId, changeQty, reason, refNote) {
  db.prepare(`UPDATE products SET stock_qty = stock_qty + ?, updated_at = datetime('now') WHERE id = ?`).run(changeQty, productId);
  recordMovement(productId, changeQty, reason, refNote);
}

// 세트상품이 팔리면: 세트 자체 재고를 차감하고, 구성 단품 재고도 함께 차감한다.
// 펜촉 48개입 세트 1개 판매 -> 펜촉 낱개 48개 차감, 세미볼드 10색 세트 1개 판매 -> 10가지 색 각 1개씩 차감.
const sellProduct = db.transaction((productId, quantity, memo) => {
  const product = requireProductRow(productId);
  if (!product.is_sellable) throw new InventoryError('직접 판매할 수 없는 품목입니다(내부 부자재).');
  const qty = Math.trunc(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) throw new InventoryError('quantity는 1 이상의 숫자여야 합니다.');

  const note = `판매: ${product.name}${memo ? ` (${memo})` : ''}`;
  applyStockChange(product.id, -qty, 'sale', note);

  const breakdown = [];
  if (product.is_set) {
    const componentTotals = expandComponents(product.id, qty);
    for (const [componentId, totalQty] of componentTotals.entries()) {
      applyStockChange(componentId, -totalQty, 'sale_cascade', `${note} -> 세트 구성 차감`);
      breakdown.push({ productId: componentId, deducted: totalQty });
    }
  }

  const updated = toProductDto(getProductRow(product.id));
  const breakdownDto = breakdown.map((b) => ({
    product: toProductDto(getProductRow(b.productId)),
    deducted: b.deducted,
  }));
  return { product: updated, componentDeductions: breakdownDto };
});

// 입고/수동 재고 조정 (양수=입고, 음수=출고/폐기). 오일파스텔 부자재처럼 판매되지 않는 품목도 조정 가능.
const adjustStock = db.transaction((productId, delta, reason, memo) => {
  const product = requireProductRow(productId);
  const change = Math.trunc(Number(delta));
  if (!Number.isFinite(change) || change === 0) throw new InventoryError('delta는 0이 아닌 숫자여야 합니다.');
  const finalReason = reason || (change > 0 ? 'adjust_in' : 'adjust_out');
  applyStockChange(product.id, change, finalReason, memo || null);
  return toProductDto(getProductRow(product.id));
});

function reorderAlerts() {
  const rows = db
    .prepare(
      `SELECT * FROM products WHERE reorder_point IS NOT NULL AND stock_qty <= reorder_point
       ORDER BY (stock_qty - reorder_point) ASC`
    )
    .all();
  return rows.map((r) => ({ ...toProductDto(r), shortage: r.reorder_point - r.stock_qty }));
}

function listMovements(productId, limit = 50) {
  requireProductRow(productId);
  return db
    .prepare('SELECT * FROM stock_movements WHERE product_id = ? ORDER BY id DESC LIMIT ?')
    .all(productId, Math.min(Math.trunc(Number(limit)) || 50, 500))
    .map((m) => ({
      id: m.id,
      changeQty: m.change_qty,
      balanceAfter: m.balance_after,
      reason: m.reason,
      refNote: m.ref_note,
      createdAt: m.created_at,
    }));
}

// 세트 하나를 만드는 데 필요한 최하위 단품 총수량 (판매 전 미리보기/발주 계획용)
function previewExpansion(productId, quantity) {
  const product = requireProductRow(productId);
  const qty = Math.trunc(Number(quantity)) || 1;
  if (!product.is_set) return [];
  const totals = expandComponents(product.id, qty);
  return [...totals.entries()].map(([componentId, totalQty]) => {
    const comp = getProductRow(componentId);
    return { product: toProductDto(comp), required: totalQty, shortage: Math.max(0, totalQty - comp.stock_qty) };
  });
}

// 어떤 세트들이 이 품목을 구성품으로 쓰고 있는지 (여러 이름의 세트가 공유하는 단품 확인용)
function usedInSets(componentId) {
  requireProductRow(componentId);
  const rows = db
    .prepare(
      `SELECT p.id, p.sku, p.name, b.quantity FROM bom_items b
       JOIN products p ON p.id = b.parent_product_id
       WHERE b.component_product_id = ?
       ORDER BY p.name ASC`
    )
    .all(componentId);
  return rows.map((r) => ({ setProductId: r.id, sku: r.sku, name: r.name, quantityPerSet: r.quantity }));
}

module.exports = {
  InventoryError,
  toProductDto,
  getProductRow,
  requireProductRow,
  listProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  listBom,
  addBomItem,
  removeBomItem,
  sellProduct,
  adjustStock,
  reorderAlerts,
  listMovements,
  previewExpansion,
  usedInSets,
};
