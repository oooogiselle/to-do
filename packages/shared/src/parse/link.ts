/** Links in typed text: "great talk on rust https://youtu.be/abc" → a title and a link. */

const URL_RE = /https?:\/\/[^\s<>"']+/i;
/** Punctuation that usually ends a sentence rather than the URL. */
const TRAILING = /[.,;:!?'"]+$/;
const MAX_LINK = 2048;

function parseUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u : null;
  } catch {
    return null;
  }
}

/** Strips trailing punctuation and an unbalanced closing paren ("(see https://x.com/a)"). */
function trimUrl(raw: string): string {
  let url = raw.replace(TRAILING, "");
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0))
    url = url.slice(0, -1).replace(TRAILING, "");
  return url;
}

/** The short site name for a link chip: "youtube.com". Falls back to the input. */
export function linkLabel(url: string): string {
  const u = parseUrl(url);
  return u ? u.hostname.replace(/^www\./, "") : url;
}

/** A readable stand-in title for a bare link: "youtube.com/watch", at most 60 characters. */
export function linkTitle(url: string): string {
  const u = parseUrl(url);
  if (!u) return url;
  const path = u.pathname.replace(/\/+$/, "");
  const full = linkLabel(url) + path;
  return full.length > 60 ? `${full.slice(0, 59)}…` : full;
}

/**
 * Pulls the first http(s) link out of typed text. The rest becomes the title; a bare link is
 * titled after its site and path. `link_url` is null when there's no usable link.
 */
export function splitLink(text: string): { title: string; link_url: string | null } {
  const match = text.match(URL_RE);
  const url = match ? trimUrl(match[0]) : null;
  if (!match || !url || url.length > MAX_LINK || !parseUrl(url))
    return { title: text.trim(), link_url: null };
  const rest = (text.slice(0, match.index) + text.slice(match.index! + url.length))
    .replace(/\(\s*\)|\[\s*\]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^[\s\-–—:|,.;]+|[\s\-–—:|,.;]+$/g, "")
    .trim();
  return { title: rest || linkTitle(url), link_url: url };
}

/**
 * A link typed into a field: blank → null, a bare "site.com/page" gets https://. Returns
 * undefined when it can't be a link, so the caller can keep the old value.
 */
export function normalizeLink(text: string): string | null | undefined {
  const t = text.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  const u = parseUrl(withScheme);
  return u && u.hostname.includes(".") && withScheme.length <= MAX_LINK ? withScheme : undefined;
}
