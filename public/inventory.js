const state = { products: [] };

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

refreshAll();
