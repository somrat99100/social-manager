// Facebook post text is always plain text — there's no bold/italic markup in
// the Graph API. The standard workaround (used by most social scheduling
// tools) is to swap regular letters for their "Mathematical Sans-Serif Bold"
// Unicode twins. They're genuinely different characters, not styling, so
// they render bold everywhere: Facebook, notifications, phones, everything.

const UPPER_START = 0x41; // 'A'
const LOWER_START = 0x61; // 'a'
const DIGIT_START = 0x30; // '0'

const BOLD_UPPER_START = 0x1d5d4;
const BOLD_LOWER_START = 0x1d5ee;
const BOLD_DIGIT_START = 0x1d7ec;

function isBoldCodePoint(code) {
  return (
    (code >= BOLD_UPPER_START && code <= BOLD_UPPER_START + 25) ||
    (code >= BOLD_LOWER_START && code <= BOLD_LOWER_START + 25) ||
    (code >= BOLD_DIGIT_START && code <= BOLD_DIGIT_START + 9)
  );
}

/** Converts plain A-Z/a-z/0-9 in `text` to bold Unicode equivalents. Punctuation, spaces, and non-Latin text pass through unchanged (there's no bold variant for them). */
export function toUnicodeBold(text) {
  return Array.from(text || '')
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= UPPER_START && code <= UPPER_START + 25) {
        return String.fromCodePoint(BOLD_UPPER_START + (code - UPPER_START));
      }
      if (code >= LOWER_START && code <= LOWER_START + 25) {
        return String.fromCodePoint(BOLD_LOWER_START + (code - LOWER_START));
      }
      if (code >= DIGIT_START && code <= DIGIT_START + 9) {
        return String.fromCodePoint(BOLD_DIGIT_START + (code - DIGIT_START));
      }
      return ch;
    })
    .join('');
}

/** Reverses toUnicodeBold — turns bold Unicode characters back into plain ASCII. */
export function toPlainFromBold(text) {
  return Array.from(text || '')
    .map((ch) => {
      const code = ch.codePointAt(0);
      if (code >= BOLD_UPPER_START && code <= BOLD_UPPER_START + 25) {
        return String.fromCodePoint(UPPER_START + (code - BOLD_UPPER_START));
      }
      if (code >= BOLD_LOWER_START && code <= BOLD_LOWER_START + 25) {
        return String.fromCodePoint(LOWER_START + (code - BOLD_LOWER_START));
      }
      if (code >= BOLD_DIGIT_START && code <= BOLD_DIGIT_START + 9) {
        return String.fromCodePoint(DIGIT_START + (code - BOLD_DIGIT_START));
      }
      return ch;
    })
    .join('');
}

/** True if every letter/digit in `text` is already bold Unicode (spaces/punctuation are ignored either way) — used to decide whether clicking Bold should apply or undo it. */
export function isFullyBold(text) {
  const relevant = Array.from(text || '').filter((ch) => {
    const code = ch.codePointAt(0);
    const isPlainAlnum = /[A-Za-z0-9]/.test(ch);
    return isPlainAlnum || isBoldCodePoint(code);
  });
  if (relevant.length === 0) return false;
  return relevant.every((ch) => isBoldCodePoint(ch.codePointAt(0)));
}

/** Auto-converts `**word**` markdown-style bold (easy to type in a spreadsheet cell) into Unicode bold. Used when pulling captions in from Google Sheets. */
export function applyMarkdownBold(text) {
  if (!text) return text;
  return text.replace(/\*\*(.+?)\*\*/g, (_, inner) => toUnicodeBold(inner));
}
