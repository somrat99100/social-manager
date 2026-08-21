/**
 * Stamps a large, bold text banner onto an existing image entirely
 * client-side using Canvas 2D — no API call, no API key, no quota.
 *
 * This exists instead of asking an AI image model to render the text
 * because that path has two real problems:
 *  1. Gemini's free tier gates image generation/editing behind a
 *     per-project quota that's 0 until a billing account is linked — so
 *     "add promo text to the image" would fail out of the box for anyone
 *     who hasn't done that.
 *  2. Even when it works, AI image models are unreliable at rendering
 *     exact text — letters get garbled, misspelled, or dropped, which is
 *     the one thing that absolutely cannot happen to a promo code.
 * Drawing the text with the browser's own font rendering guarantees it
 * comes out exactly as typed, every time, for free, instantly.
 *
 * @param {string} imageSrc - a `data:` URL (already-loaded bytes; using a
 *   data URL rather than a remote one avoids canvas "tainted by cross-origin
 *   data" errors, since the browser treats data URLs as same-origin).
 * @param {string} text - the exact text to stamp on, e.g. "Promo code: ABCDEF"
 * @param {object} [opts]
 * @param {'bottom'|'top'|'center'} [opts.position='bottom']
 * @param {string} [opts.bannerColor='rgba(0,0,0,0.72)'] - banner background
 * @param {string} [opts.textColor='#ffffff']
 * @returns {Promise<{ dataUrl: string, base64: string, mimeType: string }>}
 */
export async function stampPromoText(imageSrc, text, opts = {}) {
  const label = (text || '').trim();
  if (!label) throw new Error('Enter the promo text to add first.');

  const { position = 'bottom', bannerColor = 'rgba(0, 0, 0, 0.72)', textColor = '#ffffff' } = opts;

  const img = await loadImage(imageSrc);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Auto-size the font so the text fills most of the image width, then
  // shrink to fit if it's still too wide (long promo strings, tall/narrow
  // aspect ratios, etc).
  const maxWidth = canvas.width * 0.86;
  let fontSize = Math.round(canvas.height * 0.09);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const setFont = (size) => {
    ctx.font = `700 ${size}px "Segoe UI", Arial, sans-serif`;
  };
  setFont(fontSize);
  while (fontSize > 14 && ctx.measureText(label).width > maxWidth) {
    fontSize -= 2;
    setFont(fontSize);
  }

  const paddingY = fontSize * 0.7;
  const bannerHeight = fontSize + paddingY * 2;
  let bannerY;
  if (position === 'top') bannerY = 0;
  else if (position === 'center') bannerY = (canvas.height - bannerHeight) / 2;
  else bannerY = canvas.height - bannerHeight;

  ctx.fillStyle = bannerColor;
  ctx.fillRect(0, bannerY, canvas.width, bannerHeight);

  ctx.fillStyle = textColor;
  ctx.fillText(label, canvas.width / 2, bannerY + bannerHeight / 2);

  const mimeType = 'image/png';
  const dataUrl = canvas.toDataURL(mimeType);
  const base64 = dataUrl.split(',')[1] || '';
  return { dataUrl, base64, mimeType };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load that image to edit it.'));
    img.src = src;
  });
}
