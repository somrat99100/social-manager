const GRAPH = 'https://graph.facebook.com/v20.0';

/**
 * Given a User Access Token (with pages_show_list, pages_manage_posts,
 * pages_read_engagement permissions), fetch the list of Pages the user manages.
 * Each returned page already carries its own Page Access Token, which is what
 * every other call in this file needs.
 */
export async function fetchManagedPages(userToken) {
  const res = await fetch(
    `${GRAPH}/me/accounts?fields=id,name,access_token,picture,fan_count&access_token=${encodeURIComponent(userToken)}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Facebook rejected that token.');
  return (data.data || []).map((p) => ({
    id: p.id,
    name: p.name,
    accessToken: p.access_token,
    avatar: p.picture?.data?.url || null,
    fanCount: p.fan_count ?? null,
  }));
}

/** Refresh basic display info (name/avatar/followers) for an already-connected page. */
export async function fetchPageInfo(pageId, pageAccessToken) {
  const res = await fetch(
    `${GRAPH}/${pageId}?fields=name,picture,fan_count&access_token=${encodeURIComponent(pageAccessToken)}`
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return {
    id: pageId,
    name: data.name,
    avatar: data.picture?.data?.url || null,
    fanCount: data.fan_count ?? null,
  };
}

/**
 * Publish a post to a Page. Text-only posts go to /feed; posts with an image
 * go to /photos so the image renders inline like a normal Facebook photo post.
 * `imageBase64` should be a raw base64 string (no data: prefix).
 */
export async function publishToPage({ pageId, pageAccessToken, message, imageBase64 }) {
  if (imageBase64) {
    const blob = base64ToBlob(imageBase64, 'image/png');
    const form = new FormData();
    form.append('source', blob, 'post-image.png');
    form.append('caption', message || '');
    form.append('access_token', pageAccessToken);
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { id: data.post_id || data.id };
  }
  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, access_token: pageAccessToken }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { id: data.id };
}

/** Schedule a post for the future (Facebook requires 10 min - 75 days out). */
export async function schedulePost({ pageId, pageAccessToken, message, publishTimeUnix }) {
  const res = await fetch(`${GRAPH}/${pageId}/feed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      published: false,
      scheduled_publish_time: publishTimeUnix,
      access_token: pageAccessToken,
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return { id: data.id };
}

function base64ToBlob(base64, mime) {
  const bytes = atob(base64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
