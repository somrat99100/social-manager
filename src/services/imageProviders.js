import { generateImage as geminiGenerateImage } from './gemini';
import { generateImage as pollinationsGenerateImage } from './pollinations';

export const IMAGE_PROVIDER_OPTIONS = [
  { value: 'free', label: 'Free — no key needed (FLUX)' },
  { value: 'auto', label: 'Auto (tries Gemini, falls back to free)' },
  { value: 'gemini', label: 'Gemini (uses your API key, needs billing)' },
];

/**
 * Generate an image, routing between providers:
 * - 'gemini': always use Gemini (throws if it fails).
 * - 'free': always use the free, keyless Pollinations/FLUX provider.
 * - 'auto' (default): try Gemini first when a key is set, and silently
 *   fall back to the free provider if Gemini errors out (e.g. a Google
 *   Cloud project with zero image-generation quota) — this is what keeps
 *   image generation working out of the box even before anyone touches
 *   billing settings.
 *
 * Returns { base64, mimeType, provider, fallbackFrom? }.
 */
export async function generateImageSmart(prompt, { provider = 'auto', geminiKey, aspectRatio = '1:1' } = {}) {
  if (provider === 'free') {
    const r = await pollinationsGenerateImage(prompt, { aspectRatio });
    return { ...r, provider: 'free' };
  }

  if (provider === 'gemini') {
    const r = await geminiGenerateImage(prompt, geminiKey, { aspectRatio });
    return { ...r, provider: 'gemini' };
  }

  // auto
  if (geminiKey) {
    try {
      const r = await geminiGenerateImage(prompt, geminiKey, { aspectRatio });
      return { ...r, provider: 'gemini' };
    } catch (e) {
      const r = await pollinationsGenerateImage(prompt, { aspectRatio });
      return { ...r, provider: 'free', fallbackFrom: e.message };
    }
  }

  const r = await pollinationsGenerateImage(prompt, { aspectRatio });
  return { ...r, provider: 'free' };
}
