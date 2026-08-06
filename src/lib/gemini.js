// Calls the free-tier Gemini API directly from the browser using a key
// pasted into Profile setup (aistudio.google.com/apikey). For a shipped
// product you'd proxy this through a small backend to keep the key off the
// client; for a personal tool this direct call is the fastest path to
// something real.

const TEXT_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// gemini-2.5-flash-image ("Nano Banana") is Google's current free-tier
// image model — handles both text-to-image and image editing through the
// same endpoint, just with or without an input image part. Model names on
// the image-preview line shift as Google promotes them out of preview, so
// if this starts 404ing, check aistudio.google.com/apikey for the current
// name and swap it here.
const IMAGE_MODEL = 'gemini-2.5-flash-image';
const IMAGE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

const GEMINI_URL = TEXT_URL; // kept for backward compat below

export async function generateCaptionsWithGemini({ apiKey, prompt, tone, hashtagCount }) {
  const instruction = `Write 3 distinct Facebook post captions about: "${prompt}".
Tone: ${tone}. Include ${hashtagCount} relevant hashtags at the end of each caption.
Return ONLY a JSON array of 3 strings, nothing else.`;

  const res = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: instruction }] }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // fall through
  }
  // If Gemini didn't return clean JSON, just show the raw text as one option.
  return [cleaned];
}

// Turns a short title into a full, detailed image-generation prompt,
// grounded in the page's business profile (niche, audience, voice) so the
// suggestion actually fits the account instead of being generic.
export async function suggestPromptFromTitle({ apiKey, title, profile }) {
  const context = [
    profile?.niche && `Niche: ${profile.niche}`,
    profile?.audience && `Audience: ${profile.audience}`,
    profile?.voice && `Brand voice: ${profile.voice}`,
  ].filter(Boolean).join('. ');

  const instruction = `Turn this short post title into one detailed, vivid image-generation
prompt (2-4 sentences, describing subject, setting, style, lighting, mood).
Title: "${title}".
${context ? `Context about the page this is for: ${context}.` : ''}
Return ONLY the prompt text, nothing else — no quotes, no preamble.`;

  const res = await fetch(`${TEXT_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: instruction }] }] }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return text.trim().replace(/^"|"$/g, '');
}

function extractImagesFromResponse(data) {
  if (data.error) throw new Error(data.error.message || 'Gemini API error');
  const parts = data.candidates?.[0]?.content?.parts || [];
  const images = parts
    .filter((p) => p.inlineData?.data)
    .map((p) => `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`);
  if (!images.length) {
    const text = parts.find((p) => p.text)?.text;
    throw new Error(text ? `Gemini didn't return an image: ${text.slice(0, 140)}` : 'Gemini returned no image.');
  }
  return images;
}

// Text-to-image. Returns an array of data: URLs (usually just one — Gemini
// image gen doesn't do the "4 variations" grid other tools do, so the UI
// treats this as a single result you can regenerate rather than a grid).
export async function generateImageWithGemini({ apiKey, prompt }) {
  const res = await fetch(`${IMAGE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  const data = await res.json();
  return extractImagesFromResponse(data);
}

// Image editing: pass the existing image (base64, no data: prefix) plus an
// instruction, get an edited version back. Same model as generation — it
// just conditions on the input image part too.
export async function editImageWithGemini({ apiKey, prompt, imageBase64, mimeType }) {
  const res = await fetch(`${IMAGE_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inlineData: { mimeType: mimeType || 'image/png', data: imageBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
  });
  const data = await res.json();
  return extractImagesFromResponse(data);
}

// Reads a File/Blob into a { base64, mimeType } pair for editImageWithGemini.
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const base64 = result.split(',')[1];
      resolve({ base64, mimeType: file.type || 'image/png' });
    };
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}
