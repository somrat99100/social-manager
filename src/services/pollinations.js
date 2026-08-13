/**
 * Pollinations.ai — a genuinely free, keyless image generation API
 * (runs the open FLUX model). No account, no billing, no rate-limit
 * surprises tied to a Google Cloud project. This exists so image
 * generation keeps working even when a Gemini API key has no usable
 * quota for image models.
 *
 * Docs: https://github.com/pollinations/pollinations/blob/master/APIDOCS.md
 */

const BASE = 'https://image.pollinations.ai/prompt';

// Pixel dimensions per aspect ratio — kept in sync with the values in
// gemini.js's IMAGE_ASPECT_OPTIONS so the same picker works for either provider.
const ASPECT_SIZES = {
  '1:1': [1024, 1024],
  '4:5': [896, 1120],
  '9:16': [768, 1344],
  '16:9': [1344, 768],
  '3:4': [896, 1194],
};

function photoRealPrompt(prompt) {
  return `Photograph: ${prompt.trim()}. Shot on a real camera, natural lighting, true-to-life textures, candid framing, shallow depth of field — not a digital illustration or 3D render. No text, letters, watermarks, or logos in the image.`;
}

/**
 * Generate an image from a prompt via Pollinations' free keyless endpoint.
 * Returns { base64, mimeType } or throws a human-readable error.
 */
export async function generateImage(prompt, opts = {}) {
  if (!prompt || !prompt.trim()) throw new Error('Describe the image you want first.');
  const { aspectRatio = '1:1' } = opts;
  const [width, height] = ASPECT_SIZES[aspectRatio] || ASPECT_SIZES['1:1'];
  const seed = Math.floor(Math.random() * 1_000_000_000);

  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    seed: String(seed),
    model: 'flux',
    nologo: 'true',
    safe: 'true',
    enhance: 'true',
    referrer: 'social-manager-app',
  });
  const url = `${BASE}/${encodeURIComponent(photoRealPrompt(prompt))}?${params.toString()}`;

  let res;
  try {
    res = await fetch(url);
  } catch {
    throw new Error('Could not reach the free image provider — check your internet connection and try again.');
  }
  if (!res.ok) {
    throw new Error(`Free image provider failed (HTTP ${res.status}). Try again in a moment.`);
  }

  const blob = await res.blob();
  if (!blob.type || !blob.type.startsWith('image/')) {
    throw new Error('The free image provider did not return an image — try a simpler, more concrete description.');
  }
  const base64 = await blobToBase64(blob);
  return { base64, mimeType: blob.type };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new Error('Could not read the generated image.'));
    reader.readAsDataURL(blob);
  });
}
