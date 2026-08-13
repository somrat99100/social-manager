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
 */
export async function resolveRowImages(rawImageUrl, driveApiKey) {
  const link = classifyImageLink(rawImageUrl);
  if (!link) return { images: [], folder: null, error: null };
  if (link.type === 'direct') return { images: [link.raw], folder: null, error: null };
  if (link.type === 'drive-file') return { images: [link.directUrl], folder: null, error: null };
  // drive-folder
  try {
    const files = await listDriveFolderImages(link.folderId, driveApiKey);
    if (files.length === 0) {
      return { images: [], folder: link.folderId, error: 'No images found in that Drive folder.' };
    }
    return { images: files.map((f) => f.url), folder: link.folderId, error: null };
  } catch (e) {
    return { images: [], folder: link.folderId, error: e.message };
  }
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
