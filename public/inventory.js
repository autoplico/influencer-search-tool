const state = { products: [], importPreview: null };

const productsBody = document.getElementById('productsBody');
const productCountEl = document.getElementById('productCount');
const reorderBody = document.getElementById('reorderBody');
const sellProductSelect = document.getElementById('sellProductSelect');
const adjustProductSelect = document.getElementById('adjustProductSelect');
const bomSetSelect = document.getElementById('bomSetSelect');
const bomComponentSelect = document.getElementById('bomComponentSelect');
const bomBody = document.getElementById('bomBody');

function typeLabel(p) {
  if (p.isSet) return '세트';
  return p.isSellable ? '단품' : '단품(내부용)';
}

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`);
  return data;
}

async function loadProducts() {
  const q = document.getElementById('productSearch').value;
  const type = document.getElementById('productTypeFilter').value;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (type) params.set('type', type);
  const data = await fetchJson(`/api/inventory/products?${params.toString()}`);
  state.products = data.results;
  renderProducts();
  renderSelects();
}

function renderProducts() {
  productCountEl.textContent = `(${state.products.length}개)`;
  productsBody.innerHTML = '';
  if (!state.products.length) {
    productsBody.innerHTML = '<tr><td colspan="7" class="hint">등록된 품목이 없습니다.</td></tr>';
    return;
  }
  for (const p of state.products) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}${p.category ? `<br /><span class="hint">${p.category}</span>` : ''}</td>
      <td>${typeLabel(p)}</td>
      <td>${p.isSellable ? 'O' : '-'}</td>
      <td class="${p.lowStock ? 'metric-low' : ''}">${p.stockQty.toLocaleString()} ${p.unit}</td>
      <td>${p.reorderPoint ?? '-'}</td>
      <td><button data-id="${p.id}" class="delete-btn">삭제</button></td>
    `;
    productsBody.appendChild(tr);
  }
  document.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('이 품목을 삭제할까요?')) return;
      try {
        await fetchJson(`/api/inventory/products/${btn.dataset.id}`, { method: 'DELETE' });
        await refreshAll();
      } catch (e) {
        alert(e.message);
      }
    });
  });
}

function renderSelects() {
  const sellable = state.products.filter((p) => p.isSellable);
  sellProductSelect.innerHTML = sellable
    .map((p) => `<option value="${p.id}">${p.name} (${p.sku}) - 재고 ${p.stockQty}${p.unit}</option>`)
    .join('');

  adjustProductSelect.innerHTML = state.products
    .map((p) => `<option value="${p.id}">${p.name} (${p.sku}) - 재고 ${p.stockQty}${p.unit}</option>`)
    .join('');

  const prevBomSet = bomSetSelect.value;
  const sets = state.products.filter((p) => p.isSet);
  bomSetSelect.innerHTML = sets.map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
  if (prevBomSet && sets.some((s) => String(s.id) === prevBomSet)) bomSetSelect.value = prevBomSet;

  bomComponentSelect.innerHTML = state.products
    .filter((p) => String(p.id) !== bomSetSelect.value)
    .map((p) => `<option value="${p.id}">${p.name} (${p.sku})</option>`)
    .join('');

  if (bomSetSelect.value) loadBom(bomSetSelect.value);
}

async function loadBom(setId) {
  if (!setId) {
    bomBody.innerHTML = '';
    return;
  }
  const data = await fetchJson(`/api/inventory/products/${setId}/bom`);
  bomBody.innerHTML = '';
  if (!data.results.length) {
    bomBody.innerHTML = '<tr><td colspan="5" class="hint">등록된 구성품이 없습니다.</td></tr>';
    return;
  }
  for (const b of data.results) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${b.sku}</td>
      <td>${b.name}</td>
      <td>${b.quantityPerSet}</td>
      <td>${b.currentStock} ${b.unit}</td>
      <td><button data-id="${b.bomItemId}" class="remove-bom-btn">제외</button></td>
    `;
    bomBody.appendChild(tr);
  }
  document.querySelectorAll('.remove-bom-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetchJson(`/api/inventory/bom/${btn.dataset.id}`, { method: 'DELETE' });
      loadBom(bomSetSelect.value);
    });
  });
}

async function loadReorderAlerts() {
  const data = await fetchJson('/api/inventory/reorder-alerts');
  reorderBody.innerHTML = '';
  if (!data.results.length) {
    reorderBody.innerHTML = '<tr><td colspan="6" class="hint">재주문이 필요한 품목이 없습니다.</td></tr>';
    return;
  }
  for (const p of data.results) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${typeLabel(p)}</td>
      <td class="metric-low">${p.stockQty} ${p.unit}</td>
      <td>${p.reorderPoint}</td>
      <td class="metric-low">${p.shortage}</td>
    `;
    reorderBody.appendChild(tr);
  }
}

async function refreshAll() {
  await loadProducts();
  await loadReorderAlerts();
}

document.getElementById('productSearch').addEventListener('input', () => loadProducts());
document.getElementById('productTypeFilter').addEventListener('change', () => loadProducts());
bomSetSelect.addEventListener('change', () => {
  renderSelects();
});

document.getElementById('sellForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const resultEl = document.getElementById('sellResult');
  try {
    const data = await fetchJson(`/api/inventory/products/${payload.productId}/sell`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity: Number(payload.quantity), memo: payload.memo }),
    });
    const lines = data.componentDeductions
      .map((c) => `- ${c.product.name}: -${c.deducted}${c.product.unit} (잔여 ${c.product.stockQty})`)
      .join('<br />');
    resultEl.innerHTML = `
      <p class="hint">"${data.product.name}" ${payload.quantity}${data.product.unit} 판매 처리됨 (잔여 재고 ${data.product.stockQty})</p>
      ${lines ? `<p class="hint">구성 단품 차감:<br />${lines}</p>` : ''}
    `;
    form.reset();
    form.quantity.value = 1;
    await refreshAll();
  } catch (err) {
    resultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

document.getElementById('adjustForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const resultEl = document.getElementById('adjustResult');
  try {
    const data = await fetchJson(`/api/inventory/products/${payload.productId}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: Number(payload.delta), reason: payload.reason, memo: payload.memo }),
    });
    resultEl.innerHTML = `<p class="hint">"${data.name}" 재고가 ${data.stockQty}${data.unit}(으)로 조정됨</p>`;
    form.reset();
    await refreshAll();
  } catch (err) {
    resultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

document.getElementById('bomAddForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    await fetchJson(`/api/inventory/products/${bomSetSelect.value}/bom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ componentProductId: payload.componentProductId, quantity: Number(payload.quantity) }),
    });
    form.reset();
    form.quantity.value = 1;
    loadBom(bomSetSelect.value);
  } catch (err) {
    alert(err.message);
  }
});

document.getElementById('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const payload = {
    sku: formData.get('sku'),
    name: formData.get('name'),
    category: formData.get('category') || null,
    isSet: form.isSet.checked,
    isSellable: form.isSellable.checked,
    unit: formData.get('unit') || '개',
    stockQty: Number(formData.get('stockQty')) || 0,
    reorderPoint: formData.get('reorderPoint') || null,
  };
  try {
    await fetchJson('/api/inventory/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    form.reset();
    form.isSellable.checked = true;
    await refreshAll();
  } catch (err) {
    alert(err.message);
  }
});

// --- 이지어드민 재고 현황 업로드 (재고 동기화) ---
const stockSyncPreviewEl = document.getElementById('stockSyncPreview');
const stockSyncSummaryEl = document.getElementById('stockSyncSummary');
const stockSyncResultEl = document.getElementById('stockSyncResult');
let stockSyncUploadId = null;

document.getElementById('stockSyncUploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('stockSyncFile');
  if (!fileInput.files.length) return;
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  stockSyncResultEl.innerHTML = '';
  try {
    const data = await fetchJson('/api/inventory/stock-sync/upload', { method: 'POST', body: formData });
    stockSyncUploadId = data.uploadId;
    stockSyncPreviewEl.style.display = '';
    stockSyncSummaryEl.textContent =
      `총 ${data.totalRows}행 중 단품 갱신 ${data.toUpdate}건, 신규 등록 ${data.toCreate}건, ` +
      `세트 판매량 반영 ${data.setSyncCount}건, BOM 미등록 세트(건너뜀) ${data.setMissingBomCount}건` +
      (data.skippedInvalid ? `, 무효 ${data.skippedInvalid}행` : '') +
      (data.skippedDuplicate ? `, 중복 SKU ${data.skippedDuplicate}행` : '');
  } catch (err) {
    stockSyncPreviewEl.style.display = 'none';
    stockSyncResultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

document.getElementById('stockSyncCommit').addEventListener('click', async () => {
  if (!stockSyncUploadId) return;
  try {
    const data = await fetchJson(`/api/inventory/stock-sync/${stockSyncUploadId}/commit`, { method: 'POST' });
    const setLines = data.setSyncs
      .map((s) => {
        const parts = s.cascaded.map((c) => `${c.product.name} -${c.deducted}${c.product.unit}(잔여 ${c.product.stockQty})`).join(', ');
        return `- ${s.sku} ${s.name}: ${s.soldQty}개 판매 감지 → ${parts}`;
      })
      .join('<br />');
    const skippedLines = data.setSkipped.map((s) => `- ${s.sku} ${s.name}: 구성(BOM) 미등록으로 건너뜀`).join('<br />');
    const failLines = data.failed.map((f) => `- ${f.sku} ${f.name}: ${f.reason}`).join('<br />');
    stockSyncResultEl.innerHTML = `
      <p>단품 갱신 ${data.updated.length}건, 신규 등록 ${data.created.length}건</p>
      ${setLines ? `<p class="hint">세트 판매 감지 → 색상 연쇄차감:<br />${setLines}</p>` : ''}
      ${skippedLines ? `<p class="metric-low">구성 미등록 세트(건너뜀):<br />${skippedLines}</p>` : ''}
      ${data.failed.length ? `<p class="metric-low">실패 ${data.failed.length}건:<br />${failLines}</p>` : ''}
    `;
    stockSyncPreviewEl.style.display = 'none';
    document.getElementById('stockSyncUploadForm').reset();
    stockSyncUploadId = null;
    await refreshAll();
  } catch (err) {
    stockSyncResultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

// --- 이지어드민 판매 데이터 업로드 ---
const importMappingEl = document.getElementById('importMapping');
const importResultEl = document.getElementById('importResult');
const importSheetSelect = document.getElementById('importSheet');
const importHeaderRowInput = document.getElementById('importHeaderRow');
const importSkuColSelect = document.getElementById('importSkuCol');
const importQtyColSelect = document.getElementById('importQtyCol');
const importStatusColSelect = document.getElementById('importStatusCol');
const importMemoColSelect = document.getElementById('importMemoCol');

function colOptionsHtml(headers, includeNone) {
  const opts = headers.map((h, i) => `<option value="${i}">${i}: ${h || '(빈칸)'}</option>`).join('');
  return includeNone ? `<option value="">사용 안 함</option>${opts}` : opts;
}

function renderImportPreview(data) {
  state.importPreview = data;
  importMappingEl.style.display = '';

  importSheetSelect.innerHTML = data.sheetNames.map((n, i) => `<option value="${i}">${n}</option>`).join('');
  importSheetSelect.value = data.sheetIndex;
  importHeaderRowInput.value = data.headerRow;

  importSkuColSelect.innerHTML = colOptionsHtml(data.headers, false);
  importQtyColSelect.innerHTML = colOptionsHtml(data.headers, false);
  importStatusColSelect.innerHTML = colOptionsHtml(data.headers, true);
  importMemoColSelect.innerHTML = colOptionsHtml(data.headers, true);

  if (data.guess.skuColIdx !== null) importSkuColSelect.value = data.guess.skuColIdx;
  if (data.guess.qtyColIdx !== null) importQtyColSelect.value = data.guess.qtyColIdx;
  if (data.guess.statusColIdx !== null) importStatusColSelect.value = data.guess.statusColIdx;
  if (data.guess.memoColIdx !== null) importMemoColSelect.value = data.guess.memoColIdx;

  const headHtml = data.headers.map((h, i) => `<th>${i}: ${h || '(빈칸)'}</th>`).join('');
  document.getElementById('importSampleHead').innerHTML = headHtml;
  document.getElementById('importSampleBody').innerHTML = data.sampleRows.length
    ? data.sampleRows.map((row) => `<tr>${data.headers.map((_, i) => `<td>${row[i] ?? ''}</td>`).join('')}</tr>`).join('')
    : `<tr><td colspan="${Math.max(data.headers.length, 1)}" class="hint">데이터 행이 없습니다.</td></tr>`;

  importResultEl.innerHTML = `<p class="hint">총 ${data.totalDataRows}개 데이터 행 감지됨. 컬럼을 확인한 뒤 가져오기를 실행하세요.</p>`;
}

document.getElementById('importUploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const fileInput = document.getElementById('importFile');
  if (!fileInput.files.length) return;
  const formData = new FormData();
  formData.append('file', fileInput.files[0]);
  document.getElementById('importSourceLabel').value = fileInput.files[0].name;
  try {
    const data = await fetchJson('/api/inventory/sales-import/upload', { method: 'POST', body: formData });
    renderImportPreview(data);
  } catch (err) {
    importResultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

document.getElementById('importRepreview').addEventListener('click', async () => {
  if (!state.importPreview) return;
  const params = new URLSearchParams({
    sheetIndex: importSheetSelect.value,
    headerRow: importHeaderRowInput.value,
  });
  try {
    const data = await fetchJson(`/api/inventory/sales-import/${state.importPreview.uploadId}/preview?${params.toString()}`);
    renderImportPreview(data);
  } catch (err) {
    importResultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

document.getElementById('importCommit').addEventListener('click', async () => {
  if (!state.importPreview) return;
  const payload = {
    sheetIndex: importSheetSelect.value,
    headerRow: importHeaderRowInput.value,
    skuColIdx: importSkuColSelect.value,
    qtyColIdx: importQtyColSelect.value,
    statusColIdx: importStatusColSelect.value,
    memoColIdx: importMemoColSelect.value,
    excludeStatuses: document.getElementById('importExcludeStatuses').value,
    sourceLabel: document.getElementById('importSourceLabel').value,
  };
  try {
    const data = await fetchJson(`/api/inventory/sales-import/${state.importPreview.uploadId}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const successLines = data.succeeded
      .map((s) => `- ${s.sku} ${s.name}: -${s.qty} (잔여 ${s.newStock}${s.componentCount ? `, 구성품 ${s.componentCount}종 연쇄차감` : ''})`)
      .join('<br />');
    const failLines = data.failed.map((f) => `- ${f.sku} (수량 ${f.qty}): ${f.reason}`).join('<br />');
    importResultEl.innerHTML = `
      <p class="hint">총 ${data.totalDataRows}행 중 SKU ${data.matchedSkuCount}종 처리 시도 (상태 제외 ${data.skippedByStatus}행, 무효 ${data.skippedInvalid}행)</p>
      <p>성공 ${data.succeeded.length}건${successLines ? `:<br />${successLines}` : ''}</p>
      ${data.failed.length ? `<p class="metric-low">실패 ${data.failed.length}건:<br />${failLines}</p>` : ''}
    `;
    importMappingEl.style.display = 'none';
    document.getElementById('importUploadForm').reset();
    state.importPreview = null;
    await refreshAll();
  } catch (err) {
    importResultEl.innerHTML = `<p class="metric-low">${err.message}</p>`;
  }
});

refreshAll();
