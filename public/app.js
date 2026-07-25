const state = {
  bucket: null,
};

const bucketGroupEl = document.getElementById('bucketGroup');
const resultsBody = document.getElementById('resultsBody');
const resultCountEl = document.getElementById('resultCount');

async function loadBuckets() {
  const res = await fetch('/api/influencers/buckets');
  const buckets = await res.json();
  bucketGroupEl.innerHTML = '';

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'bucket-btn active';
  allBtn.textContent = '전체';
  allBtn.addEventListener('click', () => selectBucket(null, allBtn));
  bucketGroupEl.appendChild(allBtn);

  buckets.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bucket-btn';
    btn.textContent = `${b.label} (${b.min.toLocaleString()}~${b.max.toLocaleString()})`;
    btn.addEventListener('click', () => selectBucket(b, btn));
    bucketGroupEl.appendChild(btn);
  });
}

function selectBucket(bucket, btnEl) {
  state.bucket = bucket;
  document.querySelectorAll('.bucket-btn').forEach((el) => el.classList.remove('active'));
  btnEl.classList.add('active');
  runSearch();
}

function metricClass(value, highThreshold, midThreshold) {
  if (value >= highThreshold) return 'metric-high';
  if (value >= midThreshold) return 'metric-mid';
  return '';
}

async function runSearch() {
  const params = new URLSearchParams();
  if (state.bucket) {
    params.set('minFollowers', state.bucket.min);
    params.set('maxFollowers', state.bucket.max);
  }
  const minEngagementRate = document.getElementById('minEngagementRate').value;
  const minCommentRate = document.getElementById('minCommentRate').value;
  const sortBy = document.getElementById('sortBy').value;
  const q = document.getElementById('query').value;
  if (minEngagementRate) params.set('minEngagementRate', minEngagementRate);
  if (minCommentRate) params.set('minCommentRate', minCommentRate);
  if (sortBy) params.set('sortBy', sortBy);
  if (q) params.set('q', q);

  const res = await fetch(`/api/influencers?${params.toString()}`);
  const data = await res.json();
  renderResults(data.results);
  resultCountEl.textContent = `(${data.count}명)`;
}

function renderResults(results) {
  resultsBody.innerHTML = '';
  if (!results.length) {
    resultsBody.innerHTML = '<tr><td colspan="8" class="hint">조건에 맞는 인플루언서가 없습니다.</td></tr>';
    return;
  }

  for (const r of results) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>@${r.username}</strong><br /><span class="hint">${r.displayName || ''}</span></td>
      <td>${r.category || '-'}</td>
      <td>${r.followerCount.toLocaleString()}</td>
      <td>${Math.round(r.avgLikes).toLocaleString()}</td>
      <td>${Math.round(r.avgComments).toLocaleString()}</td>
      <td class="${metricClass(r.engagementRate, 8, 4)}">${r.engagementRate}%</td>
      <td class="${metricClass(r.commentRate, 1, 0.3)}">${r.commentRate}%</td>
      <td><button data-id="${r.id}" class="sync-btn">동기화</button></td>
    `;
    resultsBody.appendChild(tr);
  }

  document.querySelectorAll('.sync-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '동기화 중...';
      try {
        const res = await fetch(`/api/influencers/${btn.dataset.id}/sync`, { method: 'POST' });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error || '동기화 실패');
        } else {
          runSearch();
        }
      } finally {
        btn.disabled = false;
        btn.textContent = '동기화';
      }
    });
  });
}

document.getElementById('searchBtn').addEventListener('click', runSearch);

document.getElementById('addForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const payload = Object.fromEntries(new FormData(form).entries());
  const res = await fetch('/api/influencers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.error || '등록 실패');
    return;
  }
  form.reset();
  runSearch();
});

document.getElementById('csvForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const res = await fetch('/api/influencers/import', { method: 'POST', body: formData });
  const data = await res.json();
  const resultEl = document.getElementById('csvResult');
  if (!res.ok) {
    resultEl.textContent = data.error || '업로드 실패';
    return;
  }
  resultEl.textContent = `${data.imported}건 등록/갱신됨${data.errors.length ? `, 오류 ${data.errors.length}건` : ''}`;
  form.reset();
  runSearch();
});

loadBuckets().then(runSearch);
