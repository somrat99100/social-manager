/**
 * Facebook actively downranks "engagement bait" — posts that ask for a
 * mechanical action (like/share/tag) purely to game the algorithm, rather
 * than earning that action through genuinely interesting content. This is
 * a lightweight pattern check run before publishing, to flag the phrasing
 * — it never blocks posting, since it's a heuristic and false positives on
 * genuine, natural asks (e.g. a real giveaway) are expected.
 */
const BAIT_PATTERNS = [
  /\blike (this|if) you\b/i,
  /\bshare (this )?(if|to win|for a chance)\b/i,
  /\btag (a friend|someone|\d+ friends?) who\b/i,
  /\bcomment (below )?if you\b/i,
  /\bdouble tap if\b/i,
  /\bwho else\b.{0,20}\?/i,
];

/** Returns a short warning string if the caption matches a known
 * engagement-bait pattern, or null if it looks fine. */
export function checkEngagementBait(caption) {
  const text = (caption || '').trim();
  if (!text) return null;
  const hit = BAIT_PATTERNS.find((re) => re.test(text));
  if (!hit) return null;
  return "This caption reads like \"engagement bait\" (e.g. \"like if…\", \"tag a friend who…\") — Facebook actively downranks phrasing like this rather than rewarding it. Consider rewording the ask, or post anyway if you're sure.";
}
