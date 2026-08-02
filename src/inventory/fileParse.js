// csv/xlsx 업로드 파싱과 임시 업로드 보관(TTL)을 위한 공용 유틸.
// salesImport(판매내역 업로드)와 stockSync(재고 현황 동기화)가 함께 사용한다.
const { parse } = require('csv-parse/sync');
const ExcelJS = require('exceljs');

function extOf(filename) {
  const m = /\.([a-z0-9]+)$/i.exec(filename || '');
  return m ? m[1].toLowerCase() : '';
}

function cellToPrimitive(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? '';
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

async function loadWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return workbook;
}

async function sheetNamesOf(buffer, ext) {
  if (ext === 'csv') return ['CSV'];
  const workbook = await loadWorkbook(buffer);
  return workbook.worksheets.map((ws) => ws.name);
}

async function rowsOf(buffer, ext, sheetIndex = 0) {
  if (ext === 'csv') {
    return parse(buffer, { columns: false, skip_empty_lines: false, relax_column_count: true });
  }
  const workbook = await loadWorkbook(buffer);
  const ws = workbook.worksheets[sheetIndex] || workbook.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    rows.push(row.values.slice(1).map(cellToPrimitive));
  });
  return rows;
}

// uploadId -> 값 을 TTL과 함께 보관하는 인메모리 저장소 (여러 사용자의 동시 업로드 미리보기를 잠깐 보관하는 용도)
function createUploadStore(ttlMs = 30 * 60 * 1000) {
  const uploads = new Map();

  function sweepExpired() {
    const now = Date.now();
    for (const [id, u] of uploads.entries()) {
      if (now - u.uploadedAt > ttlMs) uploads.delete(id);
    }
  }
  const sweepTimer = setInterval(sweepExpired, 5 * 60 * 1000);
  sweepTimer.unref();

  return {
    set(id, value) {
      sweepExpired();
      uploads.set(id, { ...value, uploadedAt: Date.now() });
    },
    get(id) {
      return uploads.get(id);
    },
    delete(id) {
      uploads.delete(id);
    },
  };
}

module.exports = { extOf, cellToPrimitive, loadWorkbook, sheetNamesOf, rowsOf, createUploadStore };
