// 이지어드민 등에서 다운로드한 판매내역 파일(csv/xlsx)을 업로드해 SKU별 판매수량을 집계하고
// 기존 sellProduct()를 호출해 재고를 차감한다. 내보내기 양식이 매번 다를 수 있어
// 헤더 행/컬럼 매핑을 업로드 후 미리보기 화면에서 직접 지정하도록 한다.
const crypto = require('crypto');
const db = require('../db');
const svc = require('./service');
const { sheetNamesOf, rowsOf, extOf, createUploadStore } = require('./fileParse');

const uploadStore = createUploadStore(); // uploadId -> { buffer, filename, ext, uploadedAt }

function registerUpload(buffer, filename) {
  const ext = extOf(filename);
  if (!['csv', 'xlsx', 'xlsm'].includes(ext)) {
    throw new svc.InventoryError('지원하지 않는 파일 형식입니다. .csv 또는 .xlsx 파일을 업로드하세요.');
  }
  const uploadId = crypto.randomUUID();
  uploadStore.set(uploadId, { buffer, filename, ext });
  return uploadId;
}

function getUpload(uploadId) {
  const u = uploadStore.get(uploadId);
  if (!u) throw new svc.InventoryError('업로드가 만료되었거나 존재하지 않습니다. 다시 업로드해주세요.', 404);
  return u;
}

const GUESS_SKU = ['상품코드', '옵션코드', '판매자상품코드', '자체상품코드', 'sku', 'SKU', '품번'];
const GUESS_QTY = ['수량', '판매수량', '주문수량'];
const GUESS_STATUS = ['주문상태', '처리상태', '클레임상태', '상태'];
const GUESS_MEMO = ['주문번호'];

function guessColumn(headers, candidates) {
  const exact = headers.findIndex((h) => candidates.includes(String(h).trim()));
  if (exact >= 0) return exact;
  const partial = headers.findIndex((h) => candidates.some((c) => String(h).includes(c)));
  return partial >= 0 ? partial : null;
}

async function preview(uploadId, { sheetIndex = 0, headerRow = 0 } = {}) {
  const u = getUpload(uploadId);
  const sIdx = Math.max(0, Math.trunc(Number(sheetIndex)) || 0);
  const hIdx = Math.max(0, Math.trunc(Number(headerRow)) || 0);
  const [sheetNames, rows] = await Promise.all([sheetNamesOf(u.buffer, u.ext), rowsOf(u.buffer, u.ext, sIdx)]);

  const headers = (rows[hIdx] || []).map((h) => (h === undefined || h === null ? '' : String(h)));
  const dataRows = rows.slice(hIdx + 1);
  const nonEmptyDataRows = dataRows.filter((r) => (r || []).some((c) => String(c ?? '').trim() !== ''));

  return {
    uploadId,
    filename: u.filename,
    sheetNames,
    sheetIndex: sIdx,
    headerRow: hIdx,
    headers,
    sampleRows: nonEmptyDataRows.slice(0, 5),
    totalDataRows: nonEmptyDataRows.length,
    guess: {
      skuColIdx: guessColumn(headers, GUESS_SKU),
      qtyColIdx: guessColumn(headers, GUESS_QTY),
      statusColIdx: guessColumn(headers, GUESS_STATUS),
      memoColIdx: guessColumn(headers, GUESS_MEMO),
    },
  };
}

function toIdxOrNull(v) {
  return v === undefined || v === null || v === '' ? null : Math.trunc(Number(v));
}

async function commit(uploadId, opts = {}) {
  const u = getUpload(uploadId);
  const { sheetIndex = 0, headerRow = 0, excludeStatuses, sourceLabel } = opts;
  const skuColIdx = toIdxOrNull(opts.skuColIdx);
  const qtyColIdx = toIdxOrNull(opts.qtyColIdx);
  const statusColIdx = toIdxOrNull(opts.statusColIdx);
  const memoColIdx = toIdxOrNull(opts.memoColIdx);

  if (skuColIdx === null) throw new svc.InventoryError('SKU 컬럼을 선택하세요.');
  if (qtyColIdx === null) throw new svc.InventoryError('수량 컬럼을 선택하세요.');

  const sIdx = Math.max(0, Math.trunc(Number(sheetIndex)) || 0);
  const hIdx = Math.max(0, Math.trunc(Number(headerRow)) || 0);
  const rows = await rowsOf(u.buffer, u.ext, sIdx);
  const dataRows = rows.slice(hIdx + 1);

  const excludeSet = new Set(
    String(excludeStatuses || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const aggregate = new Map(); // sku -> { qty, orderRefs: Set }
  let skippedByStatus = 0;
  let skippedInvalid = 0;

  for (const row of dataRows) {
    if (!row || row.every((c) => String(c ?? '').trim() === '')) continue;

    if (statusColIdx !== null) {
      const status = String(row[statusColIdx] ?? '').trim();
      if (excludeSet.has(status)) {
        skippedByStatus += 1;
        continue;
      }
    }

    const sku = String(row[skuColIdx] ?? '').trim();
    const qtyRaw = String(row[qtyColIdx] ?? '').replace(/,/g, '').trim();
    const qty = Number(qtyRaw);
    if (!sku || !Number.isFinite(qty) || qty <= 0) {
      skippedInvalid += 1;
      continue;
    }

    const entry = aggregate.get(sku) || { qty: 0, orderRefs: new Set() };
    entry.qty += qty;
    if (memoColIdx !== null) {
      const ref = String(row[memoColIdx] ?? '').trim();
      if (ref) entry.orderRefs.add(ref);
    }
    aggregate.set(sku, entry);
  }

  const succeeded = [];
  const failed = [];
  const label = sourceLabel || u.filename;
  const findProductBySku = db.prepare('SELECT * FROM products WHERE sku = ?');

  for (const [sku, entry] of aggregate.entries()) {
    const productRow = findProductBySku.get(sku);
    if (!productRow) {
      failed.push({ sku, qty: entry.qty, reason: '등록되지 않은 SKU입니다.' });
      continue;
    }
    if (!productRow.is_sellable) {
      failed.push({ sku, qty: entry.qty, reason: '판매 불가 품목(내부 부자재)입니다.' });
      continue;
    }
    try {
      const refs = [...entry.orderRefs];
      const refNote = refs.length ? ` (주문 ${refs.slice(0, 3).join(', ')}${refs.length > 3 ? ' 외' : ''})` : '';
      const memo = `이지어드민 업로드: ${label}${refNote}`;
      const result = svc.sellProduct(productRow.id, entry.qty, memo);
      succeeded.push({
        sku,
        name: result.product.name,
        qty: entry.qty,
        newStock: result.product.stockQty,
        componentCount: result.componentDeductions.length,
      });
    } catch (e) {
      failed.push({ sku, qty: entry.qty, reason: e.message });
    }
  }

  uploadStore.delete(uploadId);

  return {
    totalDataRows: dataRows.filter((r) => (r || []).some((c) => String(c ?? '').trim() !== '')).length,
    skippedByStatus,
    skippedInvalid,
    matchedSkuCount: aggregate.size,
    succeeded,
    failed,
  };
}

module.exports = { registerUpload, preview, commit };
