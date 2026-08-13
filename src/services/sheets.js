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

/**
 * Fetches and parses a public Google Sheet into rows of { rowNumber, caption, imageUrl }.
 * Expects a header row — matches "Caption"/"Text"/... and "Image"/"Image Link"/... by
 * name (case-insensitive); falls back to column A / column B if no header matches.
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
    rows.push({ rowNumber: i + 1, caption, imageUrl });
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
