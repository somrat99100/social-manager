const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-2.5-flash-image'; // free-tier image generation ("Nano Banana")

async function callGemini(model, body, apiKey) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Gemini request failed.');
  return data;
}

/** Given a topic, suggest a handful of content angles/ideas for a Facebook post. */
export async function suggestContentIdeas(topic, apiKey) {
  const prompt = `You are a social media strategist for a Facebook Page. The page owner gave this topic: "${topic}".
Suggest 4 distinct content angles for a single Facebook post about this topic. For each, give a short title (max 6 words) and a one-sentence description of the angle.
Respond ONLY as JSON: an array of objects with keys "title" and "description". No markdown, no code fences.`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '[]';
  return safeParseJsonArray(raw);
}

/** Generate 3 ready-to-use caption variations for a chosen angle/topic. */
export async function generateCaptions(brief, apiKey) {
  const prompt = `Write 3 different Facebook post captions based on this brief: "${brief}".
Each should be attention-grabbing in the first line, sound like a real page owner (not corporate), and end with a light call to action. Keep each under 60 words. Include tasteful emoji only if it fits the tone.
Respond ONLY as JSON: an array of 3 strings. No markdown, no code fences.`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  const raw = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '[]';
  return safeParseJsonArray(raw);
}

/**
 * Generate an image from a prompt using Gemini's free-tier image model.
 * Returns a base64 PNG string (no data: prefix) or throws.
 */
export async function generateImage(prompt, apiKey) {
  const data = await callGemini(
    IMAGE_MODEL,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    },
    apiKey
  );
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);
  if (!imgPart) throw new Error('Gemini did not return an image for that prompt.');
  const inline = imgPart.inlineData || imgPart.inline_data;
  return inline.data;
}

function safeParseJsonArray(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
