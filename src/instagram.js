const GRAPH_API_VERSION = process.env.IG_GRAPH_API_VERSION || 'v21.0';

/**
 * Fetches public metrics for an Instagram Business/Creator account via the
 * Graph API "Business Discovery" edge. This only works for accounts that are
 * themselves set up as Business/Creator profiles - personal accounts are not
 * reachable this way, and there is no Instagram endpoint that searches across
 * all accounts by follower count. Requires IG_BUSINESS_ACCOUNT_ID (an
 * Instagram Business account you control) and IG_ACCESS_TOKEN with the
 * instagram_business_basic permission.
 */
async function fetchInstagramMetrics(username) {
  const token = process.env.IG_ACCESS_TOKEN;
  const businessAccountId = process.env.IG_BUSINESS_ACCOUNT_ID;

  if (!token || !businessAccountId) {
    const err = new Error(
      'IG_ACCESS_TOKEN / IG_BUSINESS_ACCOUNT_ID가 설정되지 않았습니다. .env를 확인하거나 수동으로 데이터를 입력하세요.'
    );
    err.code = 'MISSING_CREDENTIALS';
    throw err;
  }

  const fields = `business_discovery.username(${username}){username,name,profile_picture_url,followers_count,media_count,media.limit(25){like_count,comments_count,timestamp}}`;
  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${businessAccountId}?fields=${encodeURIComponent(
    fields
  )}&access_token=${encodeURIComponent(token)}`;

  const res = await fetch(url);
  const body = await res.json();

  if (!res.ok) {
    const message = body && body.error && body.error.message ? body.error.message : `Instagram API 오류 (HTTP ${res.status})`;
    const err = new Error(message);
    err.code = 'INSTAGRAM_API_ERROR';
    throw err;
  }

  const discovery = body.business_discovery;
  if (!discovery) {
    const err = new Error('해당 계정을 찾을 수 없습니다. 비즈니스/크리에이터 공개 계정만 조회할 수 있습니다.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const media = discovery.media && discovery.media.data ? discovery.media.data : [];
  const postsSampled = media.length;
  const avgLikes = postsSampled ? media.reduce((sum, m) => sum + (m.like_count || 0), 0) / postsSampled : 0;
  const avgComments = postsSampled ? media.reduce((sum, m) => sum + (m.comments_count || 0), 0) / postsSampled : 0;

  return {
    username: discovery.username,
    displayName: discovery.name || null,
    followerCount: discovery.followers_count || 0,
    avgLikes,
    avgComments,
    postsSampled,
  };
}

module.exports = { fetchInstagramMetrics };
