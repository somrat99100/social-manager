import { toUnicodeBold } from '../lib/text-format';

// Reads a normal product/book page straight off the internet (no API key,
// no backend) and pulls out a Title, an Image, and a Price — the same three
// things a sheet row gives you, except sourced from a live webpage instead
// of a spreadsheet cell. Mirrors sheets.js: a "row" here is just a URL, the
// same way a sheet row is a spreadsheet row.

/** Splits a textarea of pasted links into a clean list of unique http(s) URLs, one per line (commas also accepted). */
export function parseWebsiteInput(input) {
  const raw = (input || '')
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const seen = new Set();
  const urls = [];
  for (const s of raw) {
    let url = s;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const u = new URL(url);
      const clean = u.toString();
      if (!seen.has(clean)) {
        seen.add(clean);
        urls.push(clean);
      }
    } catch {
      // not a valid URL — skip it silently, doFetch reports a count mismatch if needed
    }
  }
  return urls;
}

/**
 * Downloads a page's raw HTML. A lot of e-commerce/book-store sites don't
 * send CORS headers, so a plain browser fetch is tried first (works for
 * sites that do allow it), then falls back to public read-only CORS proxies
 * that re-serve the same bytes with permissive headers — same fallback
 * pattern as fetchImageBlob in sheets.js.
 */
async function fetchPageHtml(url) {
  const tryFetch = async (fetchUrl) => {
    const res = await fetch(fetchUrl);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.length < 40) return null;
    return text;
  };

  try {
    const html = await tryFetch(url);
    if (html) return html;
  } catch {
    // likely CORS-blocked — fall through to a proxy
  }

  try {
    const html = await tryFetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
    if (html) return html;
  } catch {
    // fall through to the next proxy
  }

  try {
    const html = await tryFetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
    if (html) return html;
  } catch {
    // fall through to the error below
  }

  throw new Error('Could not load that page — it may be blocking automated fetches, or the link is broken.');
}

function absolutize(maybeUrl, baseUrl) {
  if (!maybeUrl) return '';
  try {
    return new URL(maybeUrl, baseUrl).toString();
  } catch {
    return maybeUrl;
  }
}

/** Pulls every <script type="application/ld+json"> block and returns the parsed objects that describe a Product (schema.org), if any. Most book/e-commerce sites embed this for SEO — it's the most reliable source for title/image/price. */
function findJsonLdProduct(doc) {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    let data;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      continue;
    }
    const candidates = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
    for (const item of candidates) {
      if (!item || typeof item !== 'object') continue;
      const type = item['@type'];
      const isProduct = type === 'Product' || (Array.isArray(type) && type.includes('Product'));
      if (isProduct) return item;
    }
  }
  return null;
}

function metaContent(doc, selectors) {
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    const val = el?.getAttribute('content') || el?.getAttribute('value') || el?.textContent;
    if (val && val.trim()) return val.trim();
  }
  return '';
}

/** Best-effort price string extracted from JSON-LD offers, meta tags, or a currency-shaped regex over the visible text as a last resort. */
function extractPrice(doc, jsonLdProduct, bodyText) {
  const offers = jsonLdProduct?.offers;
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer?.price) {
    const currency = offer.priceCurrency ? `${offer.priceCurrency} ` : '';
    return `${currency}${offer.price}`.trim();
  }
  if (jsonLdProduct?.price) return String(jsonLdProduct.price);

  const metaPrice = metaContent(doc, [
    'meta[property="product:price:amount"]',
    'meta[property="og:price:amount"]',
    '[itemprop="price"]',
  ]);
  if (metaPrice) {
    const currency = metaContent(doc, ['meta[property="product:price:currency"]', 'meta[property="og:price:currency"]']);
    return currency ? `${currency} ${metaPrice}` : metaPrice;
  }

  // Last resort: scan visible text for a Taka/Dollar/Rupee-shaped price,
  // preferring one that sits near the word "price" or a sale/regular class.
  const priceRe = /(৳|টাকা|Tk\.?|BDT|₹|Rs\.?|\$)\s?([\d,]+(?:\.\d{1,2})?)/i;
  const match = bodyText.match(priceRe);
  if (match) return `${match[1]} ${match[2]}`.trim();

  return '';
}

/** Parses one page's HTML into { title, image, price }. */
function extractProductInfo(html, baseUrl) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const jsonLdProduct = findJsonLdProduct(doc);

  const title =
    jsonLdProduct?.name ||
    metaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) ||
    doc.querySelector('h1')?.textContent?.trim() ||
    doc.querySelector('title')?.textContent?.trim() ||
    '';

  let image = '';
  if (jsonLdProduct?.image) {
    image = Array.isArray(jsonLdProduct.image) ? jsonLdProduct.image[0] : jsonLdProduct.image;
    if (image && typeof image === 'object') image = image.url || '';
  }
  if (!image) {
    image = metaContent(doc, ['meta[property="og:image"]', 'meta[name="twitter:image"]']);
  }
  image = absolutize(image, baseUrl);

  const bodyText = (doc.body?.textContent || '').replace(/\s+/g, ' ').slice(0, 20000);
  const price = extractPrice(doc, jsonLdProduct, bodyText);

  return { title: title.replace(/\s+/g, ' ').trim(), image, price };
}

/** Builds the Facebook caption from a scraped title/price plus a bold promo line, e.g. "Promo Code: CAMPUS". */
export function buildWebsiteCaption({ title, price, promoCode }) {
  const lines = [];
  if (title) lines.push(title);
  if (price) lines.push(`Price: ${price}`);
  const code = (promoCode || '').trim();
  if (code) lines.push(toUnicodeBold(`Promo Code: ${code}`));
  return lines.join('\n\n');
}

/**
 * Fetches and parses a list of website URLs into rows shaped like sheet
 * rows — { rowNumber, url, title, price, caption, imageUrl, images,
 * imageCount, imageSourceType } — so the rest of the posting/scheduling UI
 * (built for sheet rows) can treat them identically. A single URL failing
 * doesn't abort the batch — it comes back as a row with `imageError` set so
 * it's visible in the queue instead of silently vanishing.
 */
export async function fetchWebsiteRows({ urls, promoCode }) {
  const rows = [];
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const rowNumber = i + 1;
    try {
      const html = await fetchPageHtml(url);
      const { title, image, price } = extractProductInfo(html, url);
      if (!title && !image && !price) {
        rows.push({
          rowNumber,
          url,
          title: '',
          price: '',
          caption: '',
          imageUrl: '',
          images: [],
          imageCount: 0,
          imageSourceType: null,
          imageError: "Couldn't find a title, image, or price on that page.",
        });
        continue;
      }
      rows.push({
        rowNumber,
        url,
        title,
        price,
        caption: buildWebsiteCaption({ title, price, promoCode }),
        imageUrl: image,
        images: image ? [image] : [],
        imageCount: image ? 1 : 0,
        imageSourceType: image ? 'direct' : null,
        imageError: null,
      });
    } catch (e) {
      rows.push({
        rowNumber,
        url,
        title: '',
        price: '',
        caption: '',
        imageUrl: '',
        images: [],
        imageCount: 0,
        imageSourceType: null,
        imageError: e.message,
      });
    }
  }
  return rows;
}
