/** Lowercase, punctuation to spaces, collapsed whitespace. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Finds `quote` in `source` ignoring case, punctuation spacing and line breaks.
 * Returns the matching range in the original source, or null.
 */
export function locateQuote(source: string, quote: string): { start: number; end: number } | null {
  const q = normalize(quote);
  if (!q) return null;
  // Build the normalized source while remembering where each normalized char came from.
  let norm = "";
  const map: number[] = [];
  let pendingSpace = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!.toLowerCase();
    if (/[\p{L}\p{N}]/u.test(ch)) {
      if (pendingSpace && norm) {
        norm += " ";
        map.push(i);
      }
      pendingSpace = false;
      norm += ch;
      map.push(i);
    } else {
      pendingSpace = true;
    }
  }
  const at = norm.indexOf(q);
  if (at === -1) return null;
  return { start: map[at]!, end: map[at + q.length - 1]! + 1 };
}
