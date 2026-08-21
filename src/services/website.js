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

/** Generic fallback: JSON-LD Product / Open Graph tags / a plain <h1>. Used only when a page doesn't match either of the site-specific patterns below, so it still works reasonably on other stores. */
function extractGenericProductInfo(doc, baseUrl) {
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

function cleanText(el) {
  return el ? el.textContent.replace(/\s+/g, ' ').trim() : '';
}

function cardImageSrc(imgEl, baseUrl) {
  if (!imgEl) return '';
  // Carousel/lazy-loaded images (e.g. Splide) often hold the real URL in a
  // data-* attribute and leave src empty/blank until scrolled into view.
  const raw = imgEl.getAttribute('data-splide-lazy') || imgEl.getAttribute('data-src') || imgEl.getAttribute('src') || '';
  return absolutize(raw, baseUrl);
}

/**
 * Matches a single product/book DETAIL page — one item described in depth,
 * e.g. https://aspectseriesbd.com/book/vr-basic-sr-s-combo-1 — using this
 * site's specific markup: `.single-book-title` for the name, the cover
 * photo image, and `.price-box` for the current price. Returns null if the
 * page doesn't look like this kind of page at all, so the caller can try a
 * listing page instead.
 */
function extractSingleBookPage(doc, baseUrl) {
  const titleEl = doc.querySelector('.single-book-title');
  if (!titleEl) return null;
  return {
    title: cleanText(titleEl),
    image: cardImageSrc(doc.querySelector('.book-cover-photo img'), baseUrl),
    price: cleanText(doc.querySelector('.price-box')),
  };
}

/**
 * Matches a LISTING/CATEGORY page — many book cards on one page, e.g.
 * https://aspectseriesbd.com/books/ — and returns one entry per card
 * instead of one entry for the whole page. This site (and its own "Similar
 * Books" carousel, which reuses the same card markup) repeats `.book-title`
 * / `.book-price` inside a card, wrapped in a link to that book's own page.
 * The search starts from each `.book-title` and walks a few ancestors up to
 * find the smallest wrapper that also has a price and an image, which keeps
 * this resilient to the exact nesting differing slightly page to page.
 */
function extractBookCards(doc, baseUrl) {
  const cards = [];
  const seen = new Set();
  doc.querySelectorAll('.book-title').forEach((titleEl) => {
    const title = cleanText(titleEl);
    if (!title) return;

    let container = titleEl.parentElement;
    let priceEl = null;
    let imgEl = null;
    let linkEl = null;
    for (let hops = 0; hops < 6 && container; hops++) {
      priceEl = priceEl || container.querySelector('.book-price, [class*="price"]');
      imgEl = imgEl || container.querySelector('img');
      linkEl = linkEl || (container.tagName === 'A' ? container : container.querySelector('a[href]'));
      if (priceEl && imgEl && linkEl) break;
      container = container.parentElement;
    }
    // Require at least a price or image alongside the title — otherwise
    // this ".book-title" match is probably unrelated page chrome, not a
    // real book card.
    if (!priceEl && !imgEl) return;

    const href = linkEl?.getAttribute?.('href') || '';
    const url = href ? absolutize(href, baseUrl) : baseUrl;
    const dedupeKey = url + '|' + title;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    cards.push({
      title,
      price: cleanText(priceEl),
      image: cardImageSrc(imgEl, baseUrl),
      url,
    });
  });
  return cards;
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

function okRow(rowNumber, url, { title, price, image }, promoCode) {
  return {
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
  };
}

function errorRow(rowNumber, url, message) {
  return {
    rowNumber,
    url,
    title: '',
    price: '',
    caption: '',
    imageUrl: '',
    images: [],
    imageCount: 0,
    imageSourceType: null,
    imageError: message,
  };
}

/**
 * Fetches and parses a list of website URLs into rows shaped like sheet
 * rows — { rowNumber, url, title, price, caption, imageUrl, images,
 * imageCount, imageSourceType } — so the rest of the posting/scheduling UI
 * (built for sheet rows) can treat them identically.
 *
 * Each URL is checked against three patterns, in order:
 *  1. A single product/book DETAIL page (one item) — e.g. a specific book's
 *     own page. Checked first so a detail page's own "Similar Books" style
 *     carousel of other items doesn't get mistaken for the main product.
 *  2. A LISTING/CATEGORY page (many items) — every book card on the page
 *     becomes its own row, exactly like the screenshot: a "[বিজ্ঞান বেসিক
 *     সিরিজ]" category page turns into one row per book shown on it, not
 *     one row for the category heading.
 *  3. A generic fallback (JSON-LD/Open Graph) for other sites that don't
 *     use this site's specific markup.
 *
 * A single URL failing doesn't abort the batch — it comes back as one error
 * row with `imageError` set so it's visible in the queue instead of
 * silently vanishing.
 */
export async function fetchWebsiteRows({ urls, promoCode }) {
  const rows = [];
  let rowNumber = 0;

  for (const url of urls) {
    try {
      const html = await fetchPageHtml(url);
      const doc = new DOMParser().parseFromString(html, 'text/html');

      const single = extractSingleBookPage(doc, url);
      if (single) {
        rowNumber += 1;
        rows.push(okRow(rowNumber, url, single, promoCode));
        continue;
      }

      const cards = extractBookCards(doc, url);
      if (cards.length > 0) {
        cards.forEach((card) => {
          rowNumber += 1;
          rows.push(okRow(rowNumber, card.url, card, promoCode));
        });
        continue;
      }

      const generic = extractGenericProductInfo(doc, url);
      rowNumber += 1;
      if (!generic.title && !generic.image && !generic.price) {
        rows.push(errorRow(rowNumber, url, "Couldn't find a title, image, or price on that page."));
      } else {
        rows.push(okRow(rowNumber, url, generic, promoCode));
      }
    } catch (e) {
      rowNumber += 1;
      rows.push(errorRow(rowNumber, url, e.message));
    }
  }
  return rows;
}
