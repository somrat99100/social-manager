const GRAPH = 'https://graph.facebook.com/v20.0';

/**
 * Uploads one image to the Page's photo library without publishing it as
 * its own post. Returns the photo's ID, which gets attached to a /feed
 * post afterwards — this is how Facebook builds a single post containing
 * several images (a "multi-photo" post).
 */
async function uploadUnpublishedPhoto(pageId, pageAccessToken, imageUrl) {
  const form = new FormData();
  form.append('url', imageUrl);
  form.append('published', 'false');
  form.append('access_token', pageAccessToken);
  const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: form });
  const data = await res.json();
  if (data.error) throw new Error(`Image upload failed (${imageUrl.slice(0, 60)}…): ${data.error.message}`);
  return data.id;
}


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
 * Check whether a post that was scheduled has actually gone out yet.
 * Facebook publishes scheduled posts on its own servers at the scheduled
 * time — this just asks the Graph API for the post's current status so the
 * app can flip a post's status from "scheduled" to "posted" once it's live.
 * Returns 'posted' | 'scheduled' | 'unknown' (e.g. deleted, or a transient error).
 */
export async function checkPostStatus(postId, pageAccessToken) {
  try {
    const res = await fetch(
      `${GRAPH}/${postId}?fields=is_published&access_token=${encodeURIComponent(pageAccessToken)}`
    );
    const data = await res.json();
    if (data.error) {
      // Facebook returns error code 100/etc. for a scheduled post that hasn't
      // published yet in some API versions — treat any "can't see it" error
      // as still-scheduled rather than assuming failure.
      return 'unknown';
    }
    if (data.is_published === false) return 'scheduled';
    return 'posted';
  } catch {
    return 'unknown';
  }
}

/**
 * Publish a post to a Page. Text-only posts go to /feed; posts with an image
 * go to /photos so the image renders inline like a normal Facebook photo post.
 * `imageBase64` should be a raw base64 string (no data: prefix). `imageUrl` is
 * a direct link to a publicly hosted image — Facebook fetches it server-side,
 * so nothing needs to be downloaded into the browser first (handy for images
 * that come from a Google Sheet).
 */
/**
 * Publish a post to a Page. Text-only posts go to /feed; a post with one
 * image goes to /photos so it renders inline like a normal Facebook photo
 * post; a post with several images (pass `imageUrls`) uploads each one
 * unpublished first, then attaches them all to a single /feed post — the
 * same multi-photo layout you get posting several images by hand.
 * `imageBase64` should be a raw base64 string (no data: prefix). `imageUrl`/
 * `imageUrls` are direct links to publicly hosted images — Facebook fetches
 * them server-side, so nothing needs to be downloaded into the browser first.
 */
export async function publishToPage({ pageId, pageAccessToken, message, imageBase64, imageUrl, imageUrls }) {
  const urls = imageUrls && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];

  if (urls.length > 1) {
    const photoIds = [];
    for (const u of urls) {
      photoIds.push(await uploadUnpublishedPhoto(pageId, pageAccessToken, u));
    }
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        access_token: pageAccessToken,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { id: data.id };
  }

  if (imageBase64 || urls[0]) {
    const form = new FormData();
    if (imageBase64) {
      const blob = base64ToBlob(imageBase64, 'image/png');
      form.append('source', blob, 'post-image.png');
    } else {
      form.append('url', urls[0]);
    }
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

/**
 * Schedule a post for the future (Facebook requires 10 min - 75 days out).
 * This is handled entirely on Facebook's side once submitted — the post goes
 * out at `publishTimeUnix` even if this browser tab is closed. Pass `imageUrl`
 * for a single-photo post, or `imageUrls` (2+) for a multi-photo post —
 * scheduling works the same way for both, just with more photos attached.
 */
export async function schedulePost({ pageId, pageAccessToken, message, publishTimeUnix, imageUrl, imageUrls }) {
  const urls = imageUrls && imageUrls.length > 0 ? imageUrls : imageUrl ? [imageUrl] : [];

  if (urls.length > 1) {
    const photoIds = [];
    for (const u of urls) {
      photoIds.push(await uploadUnpublishedPhoto(pageId, pageAccessToken, u));
    }
    const res = await fetch(`${GRAPH}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        attached_media: photoIds.map((id) => ({ media_fbid: id })),
        published: false,
        scheduled_publish_time: publishTimeUnix,
        access_token: pageAccessToken,
      }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { id: data.id };
  }

  if (urls[0]) {
    const form = new FormData();
    form.append('url', urls[0]);
    form.append('caption', message || '');
    form.append('published', 'false');
    form.append('scheduled_publish_time', String(publishTimeUnix));
    form.append('access_token', pageAccessToken);
    const res = await fetch(`${GRAPH}/${pageId}/photos`, { method: 'POST', body: form });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return { id: data.post_id || data.id };
  }
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
