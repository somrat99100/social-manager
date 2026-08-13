const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TEXT_MODEL = 'gemini-3.5-flash';
// Nano Banana — Google's free-tier image generation model. (gemini-3.x image
// models are paid-only with no free quota, which is why generation used to fail.)
const IMAGE_MODEL = 'gemini-2.5-flash-image';

async function callGemini(model, body, apiKey) {
  if (!apiKey) throw new Error('Add your free Gemini API key in Connect profile first.');

  let res;
  try {
    res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Could not reach Gemini — check your internet connection and try again.');
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini request failed (HTTP ${res.status}). Try again in a moment.`);
  }

  if (data.error) throw new Error(diagnoseGeminiError(data.error, res.status));
  if (!res.ok) throw new Error(`Gemini request failed (HTTP ${res.status}).`);
  return data;
}

function diagnoseGeminiError(error, status) {
  const msg = error?.message || 'Gemini request failed.';
  const m = msg.toLowerCase();
  if (status === 400 && (m.includes('api key not valid') || m.includes('api_key_invalid'))) {
    return 'That Gemini API key looks invalid. Double-check it in Connect profile.';
  }
  if (status === 403) {
    return 'This Gemini API key does not have access to that model. Make sure your key is enabled at aistudio.google.com.';
  }
  if (status === 429 || m.includes('quota') || m.includes('resource_exhausted') || m.includes('rate limit')) {
    // Google sometimes returns a hard `limit: 0` for image generation on
    // Free-tier projects (not a real "you used it up" rate limit) — that
    // needs billing linked to the project, not a wait-and-retry.
    const isZeroQuota = /limit:\s*0\b/i.test(msg) || /free_tier/i.test(msg);
    if (isZeroQuota) {
      return "This Google Cloud project's free tier has zero image-generation quota (Google gates this per-project, separate from your usage). Fix: link a billing account to the project behind this API key at console.cloud.google.com/billing — it's free to link and image generation itself costs a fraction of a cent per image, but the 0-quota block won't lift until billing is linked.";
    }
    return "You've hit Gemini's rate limit for this key. Wait a minute and try again — daily quotas reset at midnight Pacific time.";
  }
  if (status === 503 || m.includes('unavailable') || m.includes('overloaded')) {
    return "Gemini's servers are overloaded right now. Try again in a few seconds.";
  }
  return msg;
}

function textOf(data) {
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
}

// ---- shared voice guardrails -------------------------------------------
// Every writing prompt below funnels through these so captions read like a
// real page owner posting to Facebook, never like "an AI wrote this."

export const TONE_OPTIONS = [
  { value: 'friendly', label: 'Friendly & warm' },
  { value: 'trendy', label: 'Bold & trendy' },
  { value: 'professional', label: 'Professional' },
  { value: 'playful', label: 'Playful & funny' },
  { value: 'inspirational', label: 'Inspirational' },
  { value: 'storytelling', label: 'Storytelling' },
];

const TONE_GUIDES = {
  friendly: 'warm and approachable, like a small-business owner chatting with regulars',
  trendy: 'confident, current, a little playful — internet-fluent without trying too hard, the voice that actually gets shared',
  professional: 'polished and credible, but never stiff or corporate',
  playful: 'funny, cheeky, a little irreverent, not afraid of a good pun',
  inspirational: 'uplifting and motivational, speaks to a bigger why without being preachy',
  storytelling: 'opens on a small, specific, relatable moment, then connects it back to the point',
};

const AI_TELLS_RULE =
  'Never use these AI-sounding tells: "in today\'s world/fast-paced world", "unlock", "elevate", "dive into", "embark", "tapestry", "game-changer", "let\'s dive in", "boost your", "unleash", or padding three items together purely for rhythm. Write the way an actual person types a Facebook post — plain words, specific details, contractions, occasional sentence fragments.';

function emojiRule(level) {
  if (level === 'none') return 'Do not use any emoji.';
  if (level === 'expressive') return 'Use emoji naturally throughout like someone who genuinely likes them — but never two in a row.';
  return 'Use 1-3 emoji total, only where they add real feeling, never as decoration.';
}

function hashtagRule(include) {
  return include
    ? 'End with 2-4 short, specific hashtags on their own final line — no generic filler like #love or #instagood, make each one actually about this post. Facebook does not reward hashtag-stuffing, so keep it light.'
    : 'Do not include any hashtags.';
}

/** Given a topic, suggest a handful of trend-aware content angles for a single Facebook post. */
export async function suggestContentIdeas(topic, apiKey) {
  const prompt = `You're a social media strategist who lives on Facebook and knows what actually gets engagement there right now (2026). The page owner gave this topic: "${topic}".

Suggest 4 distinct, specific content angles for a single Facebook post about this topic — not "post about ${topic}" restated four ways, but four genuinely different hooks: a tip, a myth-bust, a relatable story/moment, a question that invites comments, a before/after, a seasonal tie-in, a quick stat, or similar. Mark whichever one has the strongest chance of getting shared right now as trending: true.

For each, give a short title (max 6 words) and a one-sentence description of the angle.

Respond ONLY as JSON: an array of 4 objects with keys "title", "description", and "trending" (boolean, true for exactly one). No markdown, no code fences.`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  return safeParseJsonArray(textOf(data));
}

/**
 * Generate 3 ready-to-use, humanized Facebook caption variations for a
 * chosen angle/topic. `opts` lets the caller steer voice and formatting.
 */
export async function generateCaptions(brief, apiKey, opts = {}) {
  const { tone = 'friendly', includeHashtags = true, emojiLevel = 'tasteful' } = opts;
  const toneDesc = TONE_GUIDES[tone] || TONE_GUIDES.friendly;

  const prompt = `You're a social media manager who writes real, scroll-stopping Facebook posts for a small business or creator page — never in "corporate AI" voice.

Brief: "${brief}"
Voice for this post: ${toneDesc}

Write 3 different caption options. For each one:
- Line 1 has to hook attention in under 12 words — Facebook only shows the first line or two before "See more," so it has to earn the click.
- Use short lines and natural paragraph breaks (2-4 short chunks), the way real people post on Facebook — never one dense wall of text.
- Sound like a specific human who actually runs this page: concrete details, contractions, real opinions, no filler.
- End with one clear, low-friction call to action that fits the topic (comment, tag a friend, share, save, ask a question back) — not a generic "learn more."
- ${emojiRule(emojiLevel)}
- ${hashtagRule(includeHashtags)}
- ${AI_TELLS_RULE}
- Keep each caption under 90 words total, hashtags included.

Respond ONLY as JSON: an array of exactly 3 strings, each a complete ready-to-post caption with real line breaks written as \\n. No markdown, no code fences, no commentary before or after.`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  return safeParseJsonArray(textOf(data));
}

/** Suggest a short, concrete image prompt that pairs with a given caption or topic. */
export async function suggestImagePrompt(context, apiKey) {
  const prompt = `Based on this Facebook post caption or topic: "${context}"

Write one short, vivid prompt (under 25 words) for an image that would sit naturally above this caption in a Facebook feed — concrete and specific (a real scene, subject, or composition), photographic or clean illustrative style, well-lit, no text or logos rendered in the image.

Respond with ONLY the prompt text, nothing else — no quotes, no preamble.`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  return textOf(data).trim().replace(/^["']|["']$/g, '');
}

/**
 * The Auto-pilot generator: given just a topic, invents a fresh angle,
 * writes the full caption, and proposes a matching image prompt in one
 * call — this is what powers "give it a topic and a schedule, it handles
 * the rest."
 */
export async function generateAutoPost(opts, apiKey) {
  const { topic, tone = 'trendy', includeHashtags = true, emojiLevel = 'tasteful', recentAngles = [] } = opts;
  const toneDesc = TONE_GUIDES[tone] || TONE_GUIDES.trendy;
  const avoidRule =
    recentAngles.length > 0
      ? `Do not repeat or lightly reword any of these angles already used recently: ${recentAngles.map((a) => `"${a}"`).join(', ')}. Find a genuinely different one.`
      : '';

  const prompt = `You're an autonomous Facebook content creator, fully trusted to post for a page about: "${topic}".

First, invent ONE fresh, specific angle on this topic that would actually stop someone mid-scroll today — a practical tip, a myth-bust, a quick stat, a relatable mini-story, a seasonal or timely tie-in, a question, or a behind-the-scenes detail. Do not just restate the topic. ${avoidRule}

Voice for this post: ${toneDesc}

Then write the Facebook caption for it:
- Line 1 hooks in under 12 words.
- Short natural paragraphs (2-4 chunks), never one dense block.
- Sounds like a real person posting to their own page, not a press release.
- Ends with one natural, low-friction call to action.
- ${emojiRule(emojiLevel)}
- ${hashtagRule(includeHashtags)}
- ${AI_TELLS_RULE}
- Under 90 words total, hashtags included.

Finally, write a short, vivid image prompt (under 25 words) for an image that pairs with this exact caption — concrete, specific, photographic or clean illustrative style, well-lit, no text or logos in the image.

Respond ONLY as this JSON object, no markdown, no code fences, no commentary:
{"angle": "short label for the angle you picked", "caption": "the full caption with real line breaks as \\n", "imagePrompt": "the image prompt"}`;

  const data = await callGemini(TEXT_MODEL, { contents: [{ parts: [{ text: prompt }] }] }, apiKey);
  return safeParseJsonObject(textOf(data));
}

/** Aspect ratios supported by Gemini's image model, for a picker in the UI. */
export const IMAGE_ASPECT_OPTIONS = [
  { value: '1:1', label: 'Square · 1:1' },
  { value: '4:5', label: 'Portrait · 4:5' },
  { value: '9:16', label: 'Story/Reel · 9:16' },
  { value: '16:9', label: 'Landscape · 16:9' },
  { value: '3:4', label: 'Tall · 3:4' },
];

// Wraps the user's/AI's short image idea with real photography language so
// the model reaches for camera-realistic output instead of the glossy,
// over-symmetrical "AI art" look — this is the single biggest lever for
// making generated images look like an actual photo a page owner took.
function photoRealPrompt(prompt) {
  return `Photograph: ${prompt.trim()}

Shot on a real camera, natural and slightly imperfect — believable lighting (soft window light, overcast daylight, or warm golden-hour sun; not studio-perfect), true-to-life textures and skin, natural shadows and a shallow depth of field, candid framing like a real phone or DSLR photo someone would actually post to Facebook.
Strictly avoid: any text, letters, numbers, captions, watermarks, or logos rendered in the image; borders or frames; a plastic/glossy "AI render" look; surreal or oversaturated colors; perfectly symmetrical composition; warped hands, extra fingers, or malformed anatomy.`;
}

/**
 * Generate an image from a prompt using Gemini's free-tier image model
 * (Nano Banana). Returns { base64, mimeType } or throws a human-readable error.
 */
export async function generateImage(prompt, apiKey, opts = {}) {
  if (!prompt || !prompt.trim()) throw new Error('Describe the image you want first.');
  const { aspectRatio = '1:1' } = opts;

  const data = await callGemini(
    IMAGE_MODEL,
    {
      contents: [{ parts: [{ text: photoRealPrompt(prompt) }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
        imageConfig: { aspectRatio },
      },
    },
    apiKey
  );

  const candidate = data.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const imgPart = parts.find((p) => p.inlineData || p.inline_data);

  if (!imgPart) {
    const finishReason = candidate?.finishReason;
    if (finishReason === 'SAFETY' || finishReason === 'IMAGE_SAFETY' || finishReason === 'PROHIBITED_CONTENT') {
      throw new Error(
        "Gemini's safety filters blocked that prompt. Try rephrasing it — avoid real people's names, violence, or anything suggestive."
      );
    }
    if (finishReason === 'RECITATION') {
      throw new Error('Gemini blocked this as too close to existing copyrighted material — try a more original description.');
    }
    const textPart = parts.find((p) => p.text)?.text;
    throw new Error(
      textPart
        ? `Gemini didn't return an image: ${textPart.slice(0, 200)}`
        : 'Gemini did not return an image for that prompt. Try a simpler, more concrete description.'
    );
  }

  const inline = imgPart.inlineData || imgPart.inline_data;
  return { base64: inline.data, mimeType: inline.mimeType || inline.mime_type || 'image/png' };
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

function safeParseJsonObject(raw) {
  const cleaned = raw.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
