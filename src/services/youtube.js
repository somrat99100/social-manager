// YouTube Data API v3 — OAuth connect + resumable (chunked) video upload.
//
// This app is client-only (no backend), so YouTube is wired up the same way
// Facebook already is here: an OAuth Client ID + Secret pasted once in
// Connect profile, used to run the whole token dance straight from the
// browser. Two things make YouTube different from Facebook's flow though:
//
// 1. Facebook can be handed an image/video *URL* and fetches it itself, so
//    posting or scheduling never has to move any bytes through this browser.
//    YouTube's upload API only accepts the actual video bytes — there is no
//    "upload from a URL" endpoint — so every YouTube publish (manual file or
//    a Drive link from a sheet) streams the file through this tab. That's
//    why uploads use the *resumable* protocol below: it splits the file into
//    chunks, retries a failed chunk instead of the whole video, and reports
//    real progress — important once files get into the hundreds of MB or
//    multiple GB.
// 2. Facebook's *scheduling* happens on Facebook's own servers after a
//    normal post call. YouTube has no separate "schedule" call — instead,
//    a video is uploaded right now as `privacyStatus: 'private'` with a
//    future `publishAt` timestamp, and YouTube itself flips it to public at
//    that time. The bytes still have to be uploaded now, from this tab.

const OAUTH_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const YT_API = 'https://www.googleapis.com/youtube/v3';
const YT_UPLOAD_API = 'https://www.googleapis.com/upload/youtube/v3/videos';
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
].join(' ');

export function oauthRedirectUri() {
  // BASE_URL reflects Vite's `base` config (e.g. "/social-manager/") so this
  // resolves correctly whether the app is hosted at the domain root or in a
  // subfolder — matching wherever oauth-callback.html actually deployed to.
  const base = import.meta.env.BASE_URL || '/';
  return `${window.location.origin}${base}oauth-callback.html`;
}

/**
 * Opens the Google consent screen in a popup and resolves with the
 * authorization code once the user approves. `access_type=offline` +
 * `prompt=consent` guarantee a refresh_token comes back on the token
 * exchange, even if this app was already authorized before.
 */
export function requestAuthorizationCode(clientId) {
  if (!clientId) return Promise.reject(new Error('Missing YouTube OAuth Client ID.'));
  const redirectUri = oauthRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
  });
  const popup = window.open(
    `${OAUTH_AUTH_URL}?${params.toString()}`,
    'yt-oauth',
    'width=480,height=640'
  );
  if (!popup) return Promise.reject(new Error('Popup blocked — allow popups for this site and try again.'));

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      clearInterval(poll);
    };
    const onMessage = (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.source !== 'social-manager-oauth') return;
      settled = true;
      cleanup();
      if (event.data.error) reject(new Error(`Google denied access: ${event.data.error}`));
      else if (event.data.code) resolve(event.data.code);
      else reject(new Error('Google did not return an authorization code.'));
    };
    window.addEventListener('message', onMessage);
    // Catches the user closing the popup without finishing the consent flow.
    const poll = setInterval(() => {
      if (popup.closed) {
        cleanup();
        if (!settled) reject(new Error('Window was closed before authorization completed.'));
      }
    }, 500);
  });
}

/** Exchanges a fresh authorization code for an access_token + refresh_token. */
export async function exchangeCodeForTokens(code, clientId, clientSecret) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: oauthRedirectUri(),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(describeOAuthError(data));
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000 - 60_000, // refresh a minute early
  };
}

/** Uses a stored refresh_token to mint a new access_token. No new refresh_token is issued. */
export async function refreshAccessToken(refreshToken, clientId, clientSecret) {
  const res = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(describeOAuthError(data));
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000 - 60_000,
  };
}

function describeOAuthError(data) {
  if (data.error === 'invalid_grant') {
    return 'Google rejected that (the connection may have been revoked) — reconnect your YouTube channel in Connect profile.';
  }
  if (data.error === 'redirect_uri_mismatch') {
    return `Google rejected the redirect URI — add ${oauthRedirectUri()} to "Authorized redirect URIs" on your OAuth Client, then try again.`;
  }
  return data.error_description || data.error || 'Google rejected that request.';
}

/**
 * Given the `youtube` block stored on the profile, returns a valid access
 * token — reusing the cached one if it's not close to expiring, otherwise
 * refreshing it. Calls `onRefreshed` with the new {accessToken, expiresAt}
 * so the caller can persist it back to Firestore (keeps future calls from
 * refreshing again unnecessarily).
 */
export async function getValidAccessToken(youtube, onRefreshed) {
  if (!youtube?.refreshToken || !youtube?.clientId || !youtube?.clientSecret) {
    throw new Error('YouTube is not connected yet — go to Connect profile.');
  }
  if (youtube.accessToken && youtube.expiresAt && youtube.expiresAt > Date.now()) {
    return youtube.accessToken;
  }
  const fresh = await refreshAccessToken(youtube.refreshToken, youtube.clientId, youtube.clientSecret);
  if (onRefreshed) await onRefreshed(fresh);
  return fresh.accessToken;
}

/** The signed-in user's own channel — used to show name/avatar/subs once connected. */
export async function fetchOwnChannel(accessToken) {
  const res = await fetch(`${YT_API}/channels?part=snippet,statistics&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Could not read that YouTube channel.');
  const channel = data.items?.[0];
  if (!channel) throw new Error('That Google account has no YouTube channel on it yet — create one at youtube.com first.');
  return {
    channelId: channel.id,
    title: channel.snippet?.title || 'My channel',
    avatar: channel.snippet?.thumbnails?.default?.url || null,
    subscriberCount: channel.statistics?.subscriberCount ?? null,
  };
}

/**
 * Builds the `snippet`/`status` body YouTube expects. `publishAt` (ISO
 * string) only takes effect when `privacyStatus` is 'private' — YouTube
 * itself flips the video public at that moment.
 */
export function buildVideoMetadata({ title, description, tags, categoryId, privacyStatus, publishAt, madeForKids }) {
  const status = {
    privacyStatus: publishAt ? 'private' : (privacyStatus || 'public'),
    selfDeclaredMadeForKids: !!madeForKids,
  };
  if (publishAt) status.publishAt = publishAt;
  return {
    snippet: {
      title: (title || 'Untitled').slice(0, 100),
      description: description || '',
      tags: (tags || []).filter(Boolean).slice(0, 500),
      categoryId: categoryId || '22',
    },
    status,
  };
}

/** Opens a resumable upload session and returns the session's upload URL. */
export async function initResumableUpload({ accessToken, metadata, fileSize, mimeType }) {
  const res = await fetch(`${YT_UPLOAD_API}?uploadType=resumable&part=snippet,status`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': String(fileSize),
      'X-Upload-Content-Type': mimeType || 'video/*',
    },
    body: JSON.stringify(metadata),
  });
  if (!res.ok) {
    let message = `YouTube rejected the upload request (${res.status}).`;
    try {
      const data = await res.json();
      if (data.error?.message) message = data.error.message;
    } catch { /* ignore parse failure, use default message */ }
    throw new Error(message);
  }
  const location = res.headers.get('Location');
  if (!location) throw new Error('YouTube did not return an upload session URL.');
  return location;
}

const CHUNK_SIZE = 16 * 1024 * 1024; // 16MB — multiple of 256KB as required by the API
const MAX_CHUNK_RETRIES = 5;

/**
 * Streams a File/Blob to an open resumable-upload session in chunks,
 * reporting 0–1 progress after every chunk. A 308 response mid-upload is
 * normal — it's Google confirming how many bytes it actually has so far
 * (which can differ from what was sent if a chunk partially landed), and
 * upload continues from there. Each chunk gets a few retries on a network
 * error before the whole upload is given up as failed.
 */
export async function uploadFileToResumableUrl(uploadUrl, file, { onProgress, isCancelled } = {}) {
  const total = file.size;
  let offset = 0;

  while (offset < total) {
    if (isCancelled && isCancelled()) throw new Error('Upload cancelled.');
    const end = Math.min(offset + CHUNK_SIZE, total);
    const chunk = file.slice(offset, end);
    const result = await putChunkWithRetry(uploadUrl, chunk, offset, end, total, onProgress);
    if (result.done) {
      onProgress?.(1);
      return result.body;
    }
    offset = result.nextOffset;
  }
  throw new Error('Upload ended unexpectedly before all bytes were sent.');
}

function putChunkWithRetry(uploadUrl, chunk, offset, end, total, onProgress) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const attemptOnce = () => {
      attempt += 1;
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Range', `bytes ${offset}-${end - 1}/${total}`);
      xhr.upload.onprogress = (e) => {
        if (!onProgress || !e.lengthComputable) return;
        onProgress(Math.min((offset + e.loaded) / total, 0.999));
      };
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 201) {
          let body = null;
          try { body = JSON.parse(xhr.responseText); } catch { /* no body */ }
          resolve({ done: true, body });
        } else if (xhr.status === 308) {
          const range = xhr.getResponseHeader('Range'); // e.g. "bytes=0-16777215"
          const match = range && range.match(/bytes=0-(\d+)/);
          resolve({ done: false, nextOffset: match ? Number(match[1]) + 1 : end });
        } else if (xhr.status >= 500 && attempt < MAX_CHUNK_RETRIES) {
          setTimeout(attemptOnce, 1000 * attempt);
        } else {
          reject(new Error(`YouTube upload failed (${xhr.status}): ${xhr.responseText?.slice(0, 300) || 'unknown error'}`));
        }
      };
      xhr.onerror = () => {
        if (attempt < MAX_CHUNK_RETRIES) setTimeout(attemptOnce, 1000 * attempt);
        else reject(new Error('Network error during upload — check your connection and try again.'));
      };
      xhr.send(chunk);
    };

    attemptOnce();
  });
}

/** High-level helper: opens a session and uploads the whole file, with progress. */
export async function uploadVideo({ accessToken, file, metadata, onProgress, isCancelled }) {
  const uploadUrl = await initResumableUpload({
    accessToken,
    metadata,
    fileSize: file.size,
    mimeType: file.type || 'video/*',
  });
  return uploadFileToResumableUrl(uploadUrl, file, { onProgress, isCancelled });
}

/** Replaces a video's thumbnail. Requires the channel to be phone-verified on YouTube's side. */
export async function setThumbnail(accessToken, videoId, thumbnailFile) {
  const res = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}&uploadType=media`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': thumbnailFile.type || 'image/jpeg',
    },
    body: thumbnailFile,
  });
  if (!res.ok) {
    let message = `Video uploaded, but the custom thumbnail was rejected (${res.status}).`;
    try {
      const data = await res.json();
      if (data.error?.message) message = `Video uploaded, but the thumbnail failed: ${data.error.message}`;
    } catch { /* ignore */ }
    throw new Error(message);
  }
}

export const YOUTUBE_CATEGORIES = [
  { id: '22', label: 'People & Blogs' },
  { id: '24', label: 'Entertainment' },
  { id: '27', label: 'Education' },
  { id: '26', label: 'Howto & Style' },
  { id: '28', label: 'Science & Technology' },
  { id: '25', label: 'News & Politics' },
  { id: '17', label: 'Sports' },
  { id: '19', label: 'Travel & Events' },
  { id: '20', label: 'Gaming' },
  { id: '10', label: 'Music' },
  { id: '15', label: 'Pets & Animals' },
  { id: '23', label: 'Comedy' },
];
