import { applyMarkdownBold } from '../lib/text-format';

// Reads rows straight out of a public Google Sheet — no API key, no backend.
// Works with any sheet shared as "Anyone with the link — Viewer" by hitting
// Google's own CSV export endpoint (gviz), which sends CORS headers that
// allow fetching it directly from the browser.

/** Accepts a full Google Sheets URL or a bare Sheet ID. Returns { sheetId, gid } or null. */
export function parseSheetInput(input) {
  const trimmed = (input || '').trim();
  if (!trimmed) return null;

  const idMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  const gidMatch = trimmed.match(/[?&#]gid=(\d+)/);
  if (idMatch) {
    return { sheetId: idMatch[1], gid: gidMatch ? gidMatch[1] : null };
  }
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return { sheetId: trimmed, gid: null };
  }
  return null;
}

const CAPTION_HEADERS = ['caption', 'text', 'message', 'content', 'post', 'post text', 'post copy'];
const IMAGE_HEADERS = ['image', 'image link', 'image url', 'image link/url', 'photo', 'photo url', 'photo link', 'picture', 'picture url'];

// Matches Drive "single file" links in any of their common shapes:
// /file/d/ID/view, ?id=ID, /open?id=ID, /uc?id=ID, /uc?export=view&id=ID …
const DRIVE_FILE_RE = /drive\.google\.com\/(?:file\/d\/([a-zA-Z0-9_-]{10,})|(?:open|uc)\?[^#]*[?&]?id=([a-zA-Z0-9_-]{10,}))/;
// Matches Drive folder links: /drive/folders/ID or /drive/u/0/folders/ID
const DRIVE_FOLDER_RE = /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]{10,})/;

/**
 * Builds a hotlinkable direct-image URL for a public Drive file ID. This is
 * the same URL shape Drive/Photos use for their own thumbnails, so it works
 * as an <img src> and — more importantly — as a URL Facebook's own server
 * can fetch when publishing, without hitting Drive's "can't scan this file
 * for viruses" interstitial that plain drive.google.com links sometimes show.
 */
export function driveDirectImageUrl(fileId, size = 1600) {
  return `https://lh3.googleusercontent.com/d/${fileId}=w${size}`;
}

/**
 * Looks at one image-link cell and figures out what kind of link it is:
 * a normal direct image URL, a single Drive file (converted to a direct
 * link automatically), or a Drive folder (which needs a follow-up API call
 * to list its contents — see listDriveFolderImages).
 */
export function classifyImageLink(raw) {
  const url = (raw || '').trim();
  if (!url) return null;

  const folderMatch = url.match(DRIVE_FOLDER_RE);
  if (folderMatch) return { type: 'drive-folder', folderId: folderMatch[1], raw: url };

  const fileMatch = url.match(DRIVE_FILE_RE);
  if (fileMatch) {
    const fileId = fileMatch[1] || fileMatch[2];
    return { type: 'drive-file', fileId, raw: url, directUrl: driveDirectImageUrl(fileId) };
  }

  return { type: 'direct', raw: url };
}

/**
 * Lists every image directly inside a public Drive folder, using the Drive
 * v3 REST API with just an API key (no OAuth/sign-in needed) — this works
 * because the folder itself is what grants read access when it's shared as
 * "Anyone with the link", the same way the Sheets CSV export works above.
 */
export async function listDriveFolderImages(folderId, apiKey) {
  if (!apiKey) {
    throw new Error('Add a Google Drive API key in Connect profile to fetch images from a Drive folder.');
  }
  const q = `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`;
  const params = new URLSearchParams({
    q,
    fields: 'files(id,name,mimeType)',
    pageSize: '100',
    key: apiKey,
  });
  const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach the Google Drive API. Check your connection and try again.');
  }
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 403) {
      throw new Error(
        'Drive API key was rejected. Make sure the "Google Drive API" is enabled for that key\'s project, and that the folder is shared as "Anyone with the link".'
      );
    }
    if (data.error.code === 404) {
      throw new Error('That Drive folder was not found — double check the link and that it is publicly shared.');
    }
    throw new Error(data.error.message || 'Could not read that Drive folder.');
  }

  const files = (data.files || []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return files.map((f) => ({ id: f.id, name: f.name, url: driveDirectImageUrl(f.id) }));
}

/**
 * Resolves one sheet row's raw image-link cell into a list of postable
 * image URLs: 0 for an empty cell, 1 for a direct link or single Drive
 * file, or N for a Drive folder (which becomes a multi-photo post).
 * `sourceType` tells the caller how to actually publish the image(s):
 * 'direct' (a plain internet image link) gets fetched into the browser and
 * uploaded as raw bytes at post time — see fetchImageBlob below — since
 * many sites block Facebook's own server-side fetcher with hotlink
 * protection even though the link opens fine in a normal browser.
 * 'drive-file' / 'drive-folder' links keep using the existing URL-based
 * publish, since Drive's own direct-link format is reliably fetchable by
 * Facebook's servers.
 */
export async function resolveRowImages(rawImageUrl, driveApiKey) {
  const link = classifyImageLink(rawImageUrl);
  if (!link) return { images: [], folder: null, error: null, sourceType: null };
  if (link.type === 'direct') return { images: [link.raw], folder: null, error: null, sourceType: 'direct' };
  if (link.type === 'drive-file') return { images: [link.directUrl], folder: null, error: null, sourceType: 'drive-file' };
  // drive-folder
  try {
    const files = await listDriveFolderImages(link.folderId, driveApiKey);
    if (files.length === 0) {
      return { images: [], folder: link.folderId, error: 'No images found in that Drive folder.', sourceType: 'drive-folder' };
    }
    return { images: files.map((f) => f.url), folder: link.folderId, error: null, sourceType: 'drive-folder' };
  } catch (e) {
    return { images: [], folder: link.folderId, error: e.message, sourceType: 'drive-folder' };
  }
}

/**
 * Downloads a plain internet image link as a Blob so it can be uploaded to
 * Facebook directly (multipart) instead of being passed as a `url` for
 * Facebook's own server to fetch. This matters because a lot of image
 * hosts/CDNs block hotlinking from unknown fetchers (including Facebook's),
 * which made "Image link from internet" rows fail to post even though the
 * link opened fine in a normal browser.
 *
 * Tries a normal browser fetch first (works for any site that allows
 * cross-origin reads); if that's blocked by CORS or fails outright, falls
 * back to a public image-proxy (images.weserv.nl) that re-serves the same
 * bytes with permissive CORS headers, which resolves almost all remaining
 * cases since the proxy itself isn't hotlink-blocked.
 */
export async function fetchImageBlob(url) {
  const tryBlob = async (fetchUrl) => {
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size === 0) return null;
    return blob;
  };

  try {
    const blob = await tryBlob(url);
    if (blob) return blob;
  } catch {
    // Likely CORS-blocked or a network hiccup — fall through to the proxy.
  }

  try {
    const bare = url.replace(/^https?:\/\//, '');
    const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(bare)}`;
    const blob = await tryBlob(proxied);
    if (blob) return blob;
  } catch {
    // fall through to the error below
  }

  throw new Error('Could not download that image link — it may be broken, private, or blocking downloads.');
}

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Fetches a public spreadsheet's real title and the list of tab (worksheet)
 * titles, using the Google Sheets API v4 with the same API key already used
 * for Drive (the "Google Drive API key" in Connect profile) — just needs
 * the Sheets API enabled on that same key's Cloud project. This is what
 * lets the sheet-import screen auto-detect and show the actual tab name
 * instead of the person having to know/type it, which matters once more
 * than one queue points at sheets with differently named tabs.
 */
export async function fetchSpreadsheetTabs(sheetId, apiKey) {
  if (!apiKey) {
    throw new Error('Add a Google API key in Connect profile (with the Sheets API enabled) to auto-detect tab names.');
  }
  const params = new URLSearchParams({ key: apiKey, fields: 'properties.title,sheets.properties(title,sheetId,index)' });
  const res = await fetch(`${SHEETS_API}/${sheetId}?${params.toString()}`);
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 403) {
      throw new Error('That API key was rejected for Sheets — make sure the "Google Sheets API" is enabled for its project, and the sheet is shared as "Anyone with the link".');
    }
    if (data.error.code === 404) throw new Error('That sheet was not found — double check the link and that it is publicly shared.');
    throw new Error(data.error.message || 'Could not read that sheet\'s tabs.');
  }
  const tabs = (data.sheets || [])
    .map((s) => ({ title: s.properties.title, gid: String(s.properties.sheetId), index: s.properties.index }))
    .sort((a, b) => a.index - b.index);
  return { title: data.properties?.title || '', tabs };
}

/**
 * Fetches and parses a public Google Sheet into rows of { rowNumber, caption, imageUrl }.
 * Expects a header row — matches "Caption"/"Text"/... and "Image"/"Image Link"/... by
 * name (case-insensitive); falls back to column A / column B if no header matches.
 * Captions written with **double asterisks** are auto-converted to bold text.
 */
export async function fetchSheetRows({ sheetId, gid, sheetName }) {
  const params = new URLSearchParams({ tqx: 'out:csv' });
  if (sheetName && sheetName.trim()) params.set('sheet', sheetName.trim());
  else if (gid) params.set('gid', gid);

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach Google Sheets. Check your connection and try again.');
  }

  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      throw new Error('Sheet or tab not found — double check the link and the tab name.');
    }
    throw new Error('That sheet could not be read. Make sure it is shared as "Anyone with the link — Viewer".');
  }

  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('That sheet isn\'t public yet. Open it → Share → "Anyone with the link" → Viewer, then try again.');
  }

  const table = parseCsv(text);
  if (table.length === 0) return [];

  const headers = table[0].map((h) => (h || '').trim().toLowerCase());
  const captionIdx = headers.findIndex((h) => CAPTION_HEADERS.includes(h));
  const imageIdx = headers.findIndex((h) => IMAGE_HEADERS.includes(h));
  const captionCol = captionIdx >= 0 ? captionIdx : 0;
  const imageCol = imageIdx >= 0 ? imageIdx : 1;

  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells || cells.every((c) => !c || !c.trim())) continue; // skip blank rows
    const caption = (cells[captionCol] || '').trim();
    const imageUrl = (cells[imageCol] || '').trim();
    if (!caption && !imageUrl) continue;
    rows.push({ rowNumber: i + 1, caption: applyMarkdownBold(caption), imageUrl });
  }
  return rows;
}

/** Minimal CSV parser: handles quoted fields, embedded commas/newlines, and "" escapes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // skip — \n follows
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// ---- YouTube: sheet rows carry a Title + Description + a Drive video link ----
// (kept separate from the image helpers above, which stay Facebook-only)

const TITLE_HEADERS = ['title', 'video title', 'heading', 'name'];
const YT_DESC_HEADERS = ['description', 'desc', 'caption', 'text', 'content'];
const VIDEO_HEADERS = ['video', 'video link', 'video url', 'video link/url', 'file', 'video file', 'drive link'];
const TAGS_HEADERS = ['tags', 'keywords'];

/**
 * Classifies one Video Link cell. Only single Drive files or direct video
 * URLs make sense per row (unlike images, a folder can't become "one
 * video"), so a folder link is reported as an error instead of resolved.
 */
export function classifyVideoLink(raw) {
  const url = (raw || '').trim();
  if (!url) return null;

  if (DRIVE_FOLDER_RE.test(url)) {
    return { type: 'drive-folder', error: 'This points at a Drive folder — put a single video file link per row instead.' };
  }
  const fileMatch = url.match(DRIVE_FILE_RE);
  if (fileMatch) {
    const fileId = fileMatch[1] || fileMatch[2];
    return { type: 'drive-file', fileId, raw: url };
  }
  return { type: 'direct', raw: url };
}

/**
 * Looks up a public Drive file's name/size/mimeType (no bytes yet) so the
 * row queue can show something meaningful before the video is actually
 * fetched at upload time.
 */
export async function fetchDriveFileMeta(fileId, apiKey) {
  if (!apiKey) throw new Error('Add a Google Drive API key in Connect profile to pull videos from Drive links.');
  const params = new URLSearchParams({ fields: 'name,mimeType,size', key: apiKey });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`);
  const data = await res.json();
  if (data.error) {
    if (data.error.code === 403) {
      throw new Error('Drive API key was rejected, or this file is not shared as "Anyone with the link — Viewer".');
    }
    if (data.error.code === 404) throw new Error('That Drive file was not found — check the link and its sharing settings.');
    throw new Error(data.error.message || 'Could not read that Drive file.');
  }
  return { name: data.name, mimeType: data.mimeType, size: Number(data.size || 0) };
}

/**
 * Downloads a public Drive file's actual bytes as a Blob. This is what
 * makes the video's size matter — the whole file is pulled into browser
 * memory here before being handed to the YouTube uploader, so extremely
 * large files (many GB) can be memory-heavy in the tab. For those, manual
 * upload straight from disk is lighter, since the browser streams a File
 * from disk rather than buffering it.
 */
export async function fetchDriveFileBlob(fileId, apiKey, onProgress) {
  if (!apiKey) throw new Error('Add a Google Drive API key in Connect profile to pull videos from Drive links.');
  const params = new URLSearchParams({ alt: 'media', key: apiKey });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?${params.toString()}`);
  if (!res.ok) {
    if (res.status === 403) throw new Error('Drive API key was rejected, or this file is not shared as "Anyone with the link — Viewer".');
    if (res.status === 404) throw new Error('That Drive file was not found — check the link and its sharing settings.');
    throw new Error(`Could not download that Drive file (${res.status}).`);
  }
  const total = Number(res.headers.get('Content-Length') || 0);
  if (!onProgress || !res.body || !total) return res.blob();

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress(Math.min(received / total, 0.999));
  }
  onProgress(1);
  return new Blob(chunks);
}

/**
 * Fetches and parses a public Google Sheet into YouTube rows of
 * { rowNumber, title, description, tags, videoLink }. Matches "Title",
 * "Description"/"Caption", "Video Link"/"Drive Link", and "Tags" columns
 * by header name (case-insensitive); falls back to columns A/B/C.
 */
export async function fetchYoutubeSheetRows({ sheetId, gid, sheetName }) {
  const params = new URLSearchParams({ tqx: 'out:csv' });
  if (sheetName && sheetName.trim()) params.set('sheet', sheetName.trim());
  else if (gid) params.set('gid', gid);

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach Google Sheets. Check your connection and try again.');
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 404) {
      throw new Error('Sheet or tab not found — double check the link and the tab name.');
    }
    throw new Error('That sheet could not be read. Make sure it is shared as "Anyone with the link — Viewer".');
  }

  const text = await res.text();
  if (/^\s*<(!doctype|html)/i.test(text)) {
    throw new Error('That sheet isn\'t public yet. Open it → Share → "Anyone with the link" → Viewer, then try again.');
  }

  const table = parseCsv(text);
  if (table.length === 0) return [];

  const headers = table[0].map((h) => (h || '').trim().toLowerCase());
  const titleIdx = headers.findIndex((h) => TITLE_HEADERS.includes(h));
  const descIdx = headers.findIndex((h) => YT_DESC_HEADERS.includes(h));
  const videoIdx = headers.findIndex((h) => VIDEO_HEADERS.includes(h));
  const tagsIdx = headers.findIndex((h) => TAGS_HEADERS.includes(h));
  const titleCol = titleIdx >= 0 ? titleIdx : 0;
  const descCol = descIdx >= 0 ? descIdx : 1;
  const videoCol = videoIdx >= 0 ? videoIdx : 2;

  const rows = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    if (!cells || cells.every((c) => !c || !c.trim())) continue;
    const title = (cells[titleCol] || '').trim();
    const description = (cells[descCol] || '').trim();
    const videoLink = (cells[videoCol] || '').trim();
    const tags = tagsIdx >= 0 ? (cells[tagsIdx] || '').split(',').map((t) => t.trim()).filter(Boolean) : [];
    if (!title && !videoLink) continue;
    rows.push({ rowNumber: i + 1, title, description: applyMarkdownBold(description), videoLink, tags });
  }
  return rows;
}
