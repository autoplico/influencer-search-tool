// 팔로워수 대비 성과를 나타내는 지표 계산
// engagementRate: (평균 좋아요 + 평균 댓글) / 팔로워수 * 100 -> "바이럴 지수"로 사용
// commentRate: 평균 댓글 / 팔로워수 * 100 -> 댓글 활성도
function withMetrics(row) {
  const followers = row.follower_count || 0;
  const avgLikes = row.avg_likes || 0;
  const avgComments = row.avg_comments || 0;

  const engagementRate = followers > 0 ? ((avgLikes + avgComments) / followers) * 100 : 0;
  const commentRate = followers > 0 ? (avgComments / followers) * 100 : 0;

  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    platform: row.platform,
    category: row.category,
    profileUrl: row.profile_url,
    followerCount: followers,
    avgLikes,
    avgComments,
    postsSampled: row.posts_sampled,
    notes: row.notes,
    lastSyncedAt: row.last_synced_at,
    engagementRate: Number(engagementRate.toFixed(2)),
    commentRate: Number(commentRate.toFixed(3)),
  };
}

const FOLLOWER_BUCKETS = [
  { key: '10k-40k', label: '1만-4만', min: 10000, max: 40000 },
  { key: '41k-70k', label: '4.1만-7만', min: 41000, max: 70000 },
  { key: '71k-100k', label: '7.1만-10만', min: 71000, max: 100000 },
  { key: '101k-155.5k', label: '10.1만-15.5만', min: 101000, max: 155000 },
];

module.exports = { withMetrics, FOLLOWER_BUCKETS };
