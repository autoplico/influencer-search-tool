const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');
const { withMetrics, FOLLOWER_BUCKETS } = require('../metrics');
const { fetchInstagramMetrics } = require('../instagram');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

router.get('/buckets', (req, res) => {
  res.json(FOLLOWER_BUCKETS);
});

// GET /api/influencers?minFollowers=&maxFollowers=&minEngagementRate=&minCommentRate=&sortBy=&order=
router.get('/', (req, res) => {
  const { minFollowers, maxFollowers, minEngagementRate, minCommentRate, sortBy, order, q } = req.query;

  let rows = db.prepare('SELECT * FROM influencers').all();

  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter(
      (r) => r.username.toLowerCase().includes(needle) || (r.display_name || '').toLowerCase().includes(needle)
    );
  }

  let results = rows.map(withMetrics);

  const min = minFollowers !== undefined ? Number(minFollowers) : undefined;
  const max = maxFollowers !== undefined ? Number(maxFollowers) : undefined;
  if (Number.isFinite(min)) results = results.filter((r) => r.followerCount >= min);
  if (Number.isFinite(max)) results = results.filter((r) => r.followerCount <= max);

  const minEng = minEngagementRate !== undefined ? Number(minEngagementRate) : undefined;
  if (Number.isFinite(minEng)) results = results.filter((r) => r.engagementRate >= minEng);

  const minComment = minCommentRate !== undefined ? Number(minCommentRate) : undefined;
  if (Number.isFinite(minComment)) results = results.filter((r) => r.commentRate >= minComment);

  const sortableFields = {
    engagementRate: 'engagementRate',
    commentRate: 'commentRate',
    followerCount: 'followerCount',
    avgLikes: 'avgLikes',
    avgComments: 'avgComments',
  };
  const sortField = sortableFields[sortBy] || 'engagementRate';
  const sortOrder = order === 'asc' ? 1 : -1;
  results.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  res.json({ count: results.length, results });
});

router.post('/', (req, res) => {
  const { username, displayName, category, profileUrl, followerCount, avgLikes, avgComments, postsSampled, notes } =
    req.body || {};

  if (!username || !String(username).trim()) {
    return res.status(400).json({ error: 'username은 필수입니다.' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO influencers
        (username, display_name, category, profile_url, follower_count, avg_likes, avg_comments, posts_sampled, notes, updated_at)
      VALUES (@username, @displayName, @category, @profileUrl, @followerCount, @avgLikes, @avgComments, @postsSampled, @notes, datetime('now'))
    `);
    const info = stmt.run({
      username: String(username).trim().replace(/^@/, ''),
      displayName: displayName || null,
      category: category || null,
      profileUrl: profileUrl || null,
      followerCount: Number(followerCount) || 0,
      avgLikes: Number(avgLikes) || 0,
      avgComments: Number(avgComments) || 0,
      postsSampled: Number(postsSampled) || 0,
      notes: notes || null,
    });
    const row = db.prepare('SELECT * FROM influencers WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json(withMetrics(row));
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return res.status(409).json({ error: '이미 등록된 계정입니다.' });
    }
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '찾을 수 없습니다.' });

  const merged = { ...existing, ...req.body };
  db.prepare(`
    UPDATE influencers SET
      display_name = @display_name,
      category = @category,
      profile_url = @profile_url,
      follower_count = @follower_count,
      avg_likes = @avg_likes,
      avg_comments = @avg_comments,
      posts_sampled = @posts_sampled,
      notes = @notes,
      updated_at = datetime('now')
    WHERE id = @id
  `).run(merged);

  const row = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  res.json(withMetrics(row));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM influencers WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// POST /api/influencers/:id/sync - Instagram Business Discovery API로 최신 지표 갱신
router.post('/:id/sync', async (req, res) => {
  const existing = db.prepare('SELECT * FROM influencers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: '찾을 수 없습니다.' });

  try {
    const metrics = await fetchInstagramMetrics(existing.username);
    db.prepare(`
      UPDATE influencers SET
        display_name = COALESCE(@displayName, display_name),
        follower_count = @followerCount,
        avg_likes = @avgLikes,
        avg_comments = @avgComments,
        posts_sampled = @postsSampled,
        last_synced_at = datetime('now'),
        updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...metrics, id: existing.id });

    const row = db.prepare('SELECT * FROM influencers WHERE id = ?').get(existing.id);
    res.json(withMetrics(row));
  } catch (e) {
    const status = e.code === 'MISSING_CREDENTIALS' ? 400 : e.code === 'NOT_FOUND' ? 404 : 502;
    res.status(status).json({ error: e.message, code: e.code });
  }
});

// POST /api/influencers/import - CSV 일괄 등록/갱신
// 컬럼: username,displayName,category,profileUrl,followerCount,avgLikes,avgComments,postsSampled
router.post('/import', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'CSV 파일을 업로드하세요.' });

  let records;
  try {
    records = parse(req.file.buffer, { columns: true, skip_empty_lines: true, trim: true });
  } catch (e) {
    return res.status(400).json({ error: `CSV 파싱 실패: ${e.message}` });
  }

  const upsert = db.prepare(`
    INSERT INTO influencers (username, display_name, category, profile_url, follower_count, avg_likes, avg_comments, posts_sampled, updated_at)
    VALUES (@username, @displayName, @category, @profileUrl, @followerCount, @avgLikes, @avgComments, @postsSampled, datetime('now'))
    ON CONFLICT(username) DO UPDATE SET
      display_name = excluded.display_name,
      category = excluded.category,
      profile_url = excluded.profile_url,
      follower_count = excluded.follower_count,
      avg_likes = excluded.avg_likes,
      avg_comments = excluded.avg_comments,
      posts_sampled = excluded.posts_sampled,
      updated_at = datetime('now')
  `);

  let imported = 0;
  const errors = [];
  const runAll = db.transaction((rows) => {
    for (const [i, r] of rows.entries()) {
      const username = (r.username || '').trim().replace(/^@/, '');
      if (!username) {
        errors.push({ row: i + 2, error: 'username 누락' });
        continue;
      }
      upsert.run({
        username,
        displayName: r.displayName || null,
        category: r.category || null,
        profileUrl: r.profileUrl || null,
        followerCount: Number(r.followerCount) || 0,
        avgLikes: Number(r.avgLikes) || 0,
        avgComments: Number(r.avgComments) || 0,
        postsSampled: Number(r.postsSampled) || 0,
      });
      imported += 1;
    }
  });
  runAll(records);

  res.json({ imported, errors });
});

module.exports = router;
