// Thin wrapper around the Facebook Graph API.
//
// This app does not ship its own registered Facebook App + OAuth redirect
// (that requires a verified business, a live domain, and app review for
// pages_manage_posts). Instead, Settings lets you paste a User Access Token
// generated from the Graph API Explorer (developers.facebook.com/tools/explorer)
// with these scopes: pages_show_list, pages_read_engagement, pages_manage_posts,
// pages_read_user_content. Every call below is real once a token is present;
// the app falls back to mock data automatically when it isn't.

const GRAPH_BASE = 'https://graph.facebook.com/v19.0';

async function graphGet(path, token, params = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Facebook API error');
  return data;
}

async function graphPost(path, token, body = {}) {
  const url = new URL(`${GRAPH_BASE}${path}`);
  url.searchParams.set('access_token', token);
  const form = new URLSearchParams(body);
  const res = await fetch(url.toString(), { method: 'POST', body: form });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Facebook API error');
  return data;
}

export async function fetchMyPages(token) {
  const data = await graphGet('/me/accounts', token, {
    fields: 'id,name,category,access_token,fan_count,picture.type(large)',
  });
  return (data.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    followers: p.fan_count ?? 0,
    picture: p.picture?.data?.url,
    pageAccessToken: p.access_token,
  }));
}

export async function fetchPageInsights(pageId, pageAccessToken) {
  // page_impressions / page_engaged_users are the standard Graph API
  // insights metrics; some may require the page to have a minimum audience.
  const metrics = 'page_impressions,page_engaged_users,page_fans';
  return graphGet(`/${pageId}/insights`, pageAccessToken, {
    metric: metrics,
    period: 'day',
  });
}

export async function fetchPagePosts(pageId, pageAccessToken, limit = 10) {
  return graphGet(`/${pageId}/posts`, pageAccessToken, {
    fields: 'id,message,created_time,likes.summary(true),comments.summary(true),shares',
    limit,
  });
}

export async function publishToPage({ pageId, pageAccessToken, message, imageUrl }) {
  if (imageUrl) {
    return graphPost(`/${pageId}/photos`, pageAccessToken, {
      url: imageUrl,
      caption: message || '',
    });
  }
  return graphPost(`/${pageId}/feed`, pageAccessToken, { message: message || '' });
}
