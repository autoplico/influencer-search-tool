// 이지어드민 "재고 현황" 다운로드 파일(공급처,제조사,상품코드,연동코드,상품명+옵션,원가,정상재고,...)을 업로드해
// SKU별 정상재고 값으로 우리 재고를 갱신한다(판매내역 차감이 아니라 스냅샷 동기화).
// - 단품(색상 낱개): 정상재고 값으로 stock_qty를 그대로 덮어씀.
// - 세트: 세트 자체의 재고 숫자는 신뢰하지 않고(이지어드민 내부 카운터일 뿐), 지난 동기화 대비 줄어든 만큼(soldQty)을
//   BOM에 등록된 색상 재고에서 연쇄로 차감한다. BOM이 아직 없는 세트는 차감을 건너뛰고 경고로 표시한다.
// - 아직 등록 안 된 SKU: 파일의 상품코드/상품명/정상재고로 새 품목을 자동 등록(세트는 첫 동기화라 차감 없이 기준값만 저장).
const crypto = require('crypto');
const db = require('../db');
const svc = require('./service');
const { extOf, rowsOf, createUploadStore } = require('./fileParse');

const uploadStore = createUploadStore(); // uploadId -> { filename, plan }

const HEADER_ALIASES = {
  supplier: ['공급처'],
  sku: ['상품코드'],
  name: ['상품명+옵션', '상품명'],
  normalStock: ['정상재고'],
};

function findHeaderIdx(headers, aliases) {
  for (const alias of aliases) {
    const idx = headers.findIndex((h) => String(h ?? '').trim() === alias);
    if (idx >= 0) return idx;
  }
  return -1;
}

function parseNumber(v) {
  const s = String(v ?? '').replace(/,/g, '').trim();
  if (s === '') return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

// 파일을 업로드해 반영 계획(plan)을 만든다. 실제 재고 반영은 commit()에서 별도로 확정한다.
async function upload(buffer, filename) {
  const ext = extOf(filename);
  if (!['csv', 'xlsx', 'xlsm'].includes(ext)) {
    throw new svc.InventoryError('지원하지 않는 파일 형식입니다. .csv 또는 .xlsx 파일을 업로드하세요.');
  }

  const rows = await rowsOf(buffer, ext, 0);
  if (!rows.length) throw new svc.InventoryError('빈 파일입니다.');

  const headers = (rows[0] || []).map((h) => String(h ?? '').trim());
  const idx = {
    supplier: findHeaderIdx(headers, HEADER_ALIASES.supplier),
    sku: findHeaderIdx(headers, HEADER_ALIASES.sku),
    name: findHeaderIdx(headers, HEADER_ALIASES.name),
    normalStock: findHeaderIdx(headers, HEADER_ALIASES.normalStock),
  };
  if (idx.sku < 0 || idx.name < 0 || idx.normalStock < 0) {
    throw new svc.InventoryError(
      '이지어드민 재고 현황 양식이 아닌 것 같습니다. "상품코드", "상품명+옵션", "정상재고" 컬럼이 필요합니다.'
    );
  }

  const dataRows = rows.slice(1);
  const plan = [];
  const seenSkus = new Set();
  let skippedInvalid = 0;
  let skippedDuplicate = 0;

  const findProductBySku = db.prepare('SELECT * FROM products WHERE sku = ?');

  for (const row of dataRows) {
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    const sku = String(row[idx.sku] ?? '').trim();
    const name = String(row[idx.name] ?? '').trim();
    const newStock = parseNumber(row[idx.normalStock]);

    if (!sku || !name || !Number.isFinite(newStock)) {
      skippedInvalid += 1;
      continue;
    }
    if (seenSkus.has(sku)) {
      skippedDuplicate += 1;
      continue;
    }
    seenSkus.add(sku);

    const supplier = idx.supplier >= 0 ? String(row[idx.supplier] ?? '').trim() || null : null;
    const existing = findProductBySku.get(sku);

    if (existing) {
      const isSet = !!existing.is_set;
      const hasBom = isSet
        ? db.prepare('SELECT COUNT(*) c FROM bom_items WHERE parent_product_id = ?').get(existing.id).c > 0
        : true;
      plan.push({
        action: 'update',
        sku,
        name,
        supplier,
        productId: existing.id,
        isSet,
        hasBom,
        oldStock: existing.stock_qty,
        newStock: Math.trunc(newStock),
        // 세트: 지난 동기화 대비 줄어든 개수(=팔린 개수). 음수면 반품/재입고로 세트 재고가 늘어난 경우.
        soldQty: isSet ? existing.stock_qty - Math.trunc(newStock) : null,
      });
    } else {
      plan.push({
        action: 'create',
        sku,
        name,
        supplier,
        newStock: Math.trunc(newStock),
        isSetGuess: name.includes('세트'),
      });
    }
  }

  const uploadId = crypto.randomUUID();
  uploadStore.set(uploadId, { filename, plan });

  return {
    uploadId,
    filename,
    totalRows: dataRows.length,
    skippedInvalid,
    skippedDuplicate,
    toUpdate: plan.filter((p) => p.action === 'update' && !p.isSet).length,
    toCreate: plan.filter((p) => p.action === 'create').length,
    setSyncCount: plan.filter((p) => p.action === 'update' && p.isSet && p.hasBom).length,
    setMissingBomCount: plan.filter((p) => p.action === 'update' && p.isSet && !p.hasBom).length,
    plan,
  };
}

function getUpload(uploadId) {
  const u = uploadStore.get(uploadId);
  if (!u) throw new svc.InventoryError('업로드가 만료되었거나 존재하지 않습니다. 다시 업로드해주세요.', 404);
  return u;
}

function commit(uploadId) {
  const u = getUpload(uploadId);
  const updated = []; // 단품(색상) 직접 덮어쓰기 결과
  const setSyncs = []; // 세트 판매량 감지 -> 색상별 연쇄차감 결과
  const setSkipped = []; // BOM 미등록 세트라 차감 건너뜀
  const created = [];
  const failed = [];
  const memo = `이지어드민 재고 동기화: ${u.filename}`;

  for (const item of u.plan) {
    try {
      if (item.action === 'update' && item.isSet) {
        if (!item.hasBom) {
          setSkipped.push({ sku: item.sku, name: item.name, oldStock: item.oldStock, newStock: item.newStock });
          continue;
        }
        const cascaded = svc.cascadeSetStockChange(item.productId, item.soldQty, 'stock_sync_cascade', memo);
        svc.setStockQty(item.productId, item.newStock, 'stock_sync', memo);
        setSyncs.push({ sku: item.sku, name: item.name, soldQty: item.soldQty, cascaded });
      } else if (item.action === 'update') {
        const before = svc.requireProductRow(item.productId);
        svc.setStockQty(item.productId, item.newStock, 'stock_sync', memo);
        if (item.supplier && item.supplier !== before.supplier) {
          svc.updateProduct(item.productId, { supplier: item.supplier });
        }
        updated.push({ sku: item.sku, name: item.name, oldStock: before.stock_qty, newStock: item.newStock });
      } else {
        svc.createProduct({
          sku: item.sku,
          name: item.name,
          supplier: item.supplier,
          isSet: item.isSetGuess,
          isSellable: true,
          stockQty: item.newStock,
        });
        created.push({ sku: item.sku, name: item.name, newStock: item.newStock, isSetGuess: item.isSetGuess });
      }
    } catch (e) {
      failed.push({ sku: item.sku, name: item.name, reason: e.message });
    }
  }

  uploadStore.delete(uploadId);

  return { updated, setSyncs, setSkipped, created, failed };
}

module.exports = { upload, getUpload, commit };
