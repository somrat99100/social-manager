/**
 * Bridge to the *web apps* at gemini.google.com and chatgpt.com — not their
 * paid APIs. Neither site can be embedded in an iframe (both send
 * X-Frame-Options / frame-ancestors headers that block iframing on purpose),
 * so this instead opens the real, free, logged-in web app in a small popup
 * window — sized and centered like an in-app dialog rather than a full new
 * browser tab — with the image prompt ready to go. The caller pastes or
 * uploads the resulting image back into the app.
 */

const CHATGPT_URL = 'https://chatgpt.com/';
const GEMINI_URL = 'https://gemini.google.com/app';

export const PROVIDER_INFO = {
  gemini: { label: 'Gemini', url: GEMINI_URL, windowName: 'sm-gemini-bridge', host: 'gemini.google.com' },
  chatgpt: { label: 'ChatGPT', url: CHATGPT_URL, windowName: 'sm-chatgpt-bridge', host: 'chatgpt.com' },
};

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Center-and-size window.open features so the popup reads as a compact
 * in-app panel next to the app, not a full-size browser window. */
function popupFeatures() {
  const width = Math.min(900, Math.round(window.screen.availWidth * 0.55));
  const height = Math.min(860, Math.round(window.screen.availHeight * 0.85));
  const left = Math.round(window.screenX + (window.outerWidth - width) - 20);
  const top = Math.round(window.screenY + 60);
  return [
    `width=${width}`,
    `height=${height}`,
    `left=${Math.max(0, left)}`,
    `top=${Math.max(0, top)}`,
    'popup=yes',
    'toolbar=no',
    'menubar=no',
    'location=no',
    'status=no',
  ].join(',');
}

/**
 * Open ChatGPT in a compact popup window with a prompt pre-filled in the
 * composer. Also copies the prompt to the clipboard as a fallback in case
 * the ?q= prefill ever stops working (it's not an official API).
 * Returns the window handle so the caller can focus/close/watch it.
 *
 * `kind` controls the wording sent to the model: 'image' asks for an image,
 * 'text' sends the prompt as-is (used for caption writing).
 */
export async function openInChatGPT(prompt, kind = 'image') {
  const text = (prompt || '').trim();
  if (!text) throw new Error(kind === 'image' ? 'Describe the image you want first.' : 'Add a brief first.');
  const fullPrompt = kind === 'image' ? `Generate an image: ${text}` : text;
  await copyToClipboard(fullPrompt);
  const url = `${CHATGPT_URL}?q=${encodeURIComponent(fullPrompt)}`;
  const win = window.open(url, PROVIDER_INFO.chatgpt.windowName, popupFeatures());
  win?.focus();
  return { window: win };
}

/**
 * Open Gemini in a compact popup window and copy the prompt to the
 * clipboard (Gemini's web app doesn't support prompt-prefill via URL, so
 * the user pastes it in). Returns the window handle plus whether the copy
 * succeeded, so the UI can show the right instructions.
 */
export async function openInGemini(prompt, kind = 'image') {
  const text = (prompt || '').trim();
  if (!text) throw new Error(kind === 'image' ? 'Describe the image you want first.' : 'Add a brief first.');
  const fullPrompt = kind === 'image' ? `Generate an image: ${text}` : text;
  const copied = await copyToClipboard(fullPrompt);
  const win = window.open(GEMINI_URL, PROVIDER_INFO.gemini.windowName, popupFeatures());
  win?.focus();
  return { window: win, copied };
}

/** Bring an already-open bridge window back to the front, or reopen it at
 * the same URL/name if the user closed it. */
export function focusOrReopenPopup(win, provider) {
  if (win && !win.closed) {
    win.focus();
    return win;
  }
  const info = PROVIDER_INFO[provider];
  if (!info) return win;
  const reopened = window.open(info.url, info.windowName, popupFeatures());
  reopened?.focus();
  return reopened;
}

/**
 * Pull an image the user copied from the Gemini/ChatGPT window (most
 * browsers' "Copy image" on a generated image puts real image bytes on the
 * clipboard) out of a paste event. Returns a Promise<{base64, mimeType,
 * dataUrl}> or null if the paste didn't contain an image.
 */
export function readImageFromPasteEvent(e) {
  const items = e.clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (!file) continue;
      return fileToBase64(file);
    }
  }
  return null;
}

/**
 * Pull plain text the user copied from the ChatGPT/Gemini window (the
 * caption it wrote) out of a paste event. Returns the trimmed string, or ''
 * if the clipboard had no usable text.
 */
export function readTextFromPasteEvent(e) {
  const text = e.clipboardData?.getData('text/plain');
  return (text || '').trim();
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      resolve({ base64: dataUrl.split(',')[1] || '', mimeType: file.type || 'image/png', dataUrl });
    };
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}
