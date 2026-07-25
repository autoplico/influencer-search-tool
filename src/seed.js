// 데모용 샘플 데이터 - 실제 서비스에서는 CSV 업로드 또는 /:id/sync API로 대체하세요.
const db = require('./db');

const sample = [
  // 1만-4만
  { username: 'daily_wander_kr', displayName: '데일리완더', category: '여행', followerCount: 22000, avgLikes: 2800, avgComments: 410, postsSampled: 20 },
  { username: 'cozy_home_diary', displayName: '코지홈다이어리', category: '리빙', followerCount: 31000, avgLikes: 1900, avgComments: 90, postsSampled: 20 },
  { username: 'sleepy_cat_studio', displayName: '슬리피캣', category: '반려동물', followerCount: 15500, avgLikes: 450, avgComments: 15, postsSampled: 20 },

  // 4.1만-7만
  { username: 'fit_with_mina', displayName: '핏민아', category: '피트니스', followerCount: 58000, avgLikes: 4100, avgComments: 650, postsSampled: 20 },
  { username: 'seoul_eats_now', displayName: '서울잇츠나우', category: '푸드', followerCount: 66000, avgLikes: 3200, avgComments: 120, postsSampled: 20 },
  { username: 'minimal_desk_kr', displayName: '미니멀데스크', category: '리빙', followerCount: 43000, avgLikes: 780, avgComments: 25, postsSampled: 20 },

  // 7.1만-10만
  { username: 'glow_skincare_jn', displayName: '글로우스킨케어', category: '뷰티', followerCount: 88000, avgLikes: 9500, avgComments: 1300, postsSampled: 20 },
  { username: 'street_style_hj', displayName: '스트릿스타일', category: '패션', followerCount: 95000, avgLikes: 5200, avgComments: 210, postsSampled: 20 },
  { username: 'quiet_bookshelf', displayName: '조용한책장', category: '라이프스타일', followerCount: 72000, avgLikes: 1100, avgComments: 40, postsSampled: 20 },

  // 10.1만-15.5만
  { username: 'trend_unbox_kr', displayName: '트렌드언박스', category: '테크', followerCount: 132000, avgLikes: 15800, avgComments: 2600, postsSampled: 20 },
  { username: 'family_kitchen_sj', displayName: '패밀리키친', category: '푸드', followerCount: 148000, avgLikes: 8900, avgComments: 480, postsSampled: 20 },
  { username: 'basic_ootd_daily', displayName: '베이직오오티디', category: '패션', followerCount: 118000, avgLikes: 2100, avgComments: 90, postsSampled: 20 },
];

const upsert = db.prepare(`
  INSERT INTO influencers (username, display_name, category, follower_count, avg_likes, avg_comments, posts_sampled, updated_at)
  VALUES (@username, @displayName, @category, @followerCount, @avgLikes, @avgComments, @postsSampled, datetime('now'))
  ON CONFLICT(username) DO UPDATE SET
    display_name = excluded.display_name,
    category = excluded.category,
    follower_count = excluded.follower_count,
    avg_likes = excluded.avg_likes,
    avg_comments = excluded.avg_comments,
    posts_sampled = excluded.posts_sampled,
    updated_at = datetime('now')
`);

const runAll = db.transaction((rows) => {
  for (const row of rows) upsert.run(row);
});
runAll(sample);

console.log(`${sample.length}개의 샘플 인플루언서를 등록했습니다.`);
