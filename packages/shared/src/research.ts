import { findUrls, urlKey } from "./parse/link";
import type { ResearchResource, ResourceKind } from "./schemas";

/** A resource as the model returned it, before checking. */
export type RawResource = {
  title: string;
  url: string;
  kind: ResourceKind;
  note: string;
  minutes: number | null;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Every link (as a urlKey) anywhere in a value: strings, arrays and objects, recursively. */
export function collectUrlKeys(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "string") {
    for (const url of findUrls(value)) {
      const key = urlKey(url);
      if (key) into.add(key);
    }
  } else if (Array.isArray(value)) {
    for (const v of value) collectUrlKeys(v, into);
  } else if (value && typeof value === "object") {
    for (const v of Object.values(value)) collectUrlKeys(v, into);
  }
  return into;
}

/**
 * Keeps only the resources whose link came back in a web search, so a made-up URL never reaches
 * the user. `toolBlocks` are the response's non-text content blocks (search results, and the
 * code that filters them). `trusted` links count as found too (ones verified in earlier turns).
 * Also drops `skip` links (the item's own link), duplicates and anything unusable, and tidies
 * titles, notes and minutes.
 */
export function verifyResources(
  resources: RawResource[],
  toolBlocks: unknown[],
  opts: { skip?: (string | null | undefined)[]; trusted?: string[]; max?: number } = {},
): ResearchResource[] {
  const seen = collectUrlKeys(toolBlocks);
  for (const url of opts.trusted ?? []) {
    const key = urlKey(url);
    if (key) seen.add(key);
  }
  const kept = new Set<string>();
  for (const url of opts.skip ?? []) {
    const key = url ? urlKey(url) : null;
    if (key) kept.add(key);
  }
  const out: ResearchResource[] = [];
  for (const r of resources) {
    const key = urlKey(r.url);
    if (!key || !seen.has(key) || kept.has(key)) continue;
    kept.add(key);
    out.push({
      title: r.title.trim().slice(0, 200) || key,
      url: r.url.trim(),
      kind: r.kind,
      note: r.note.trim().slice(0, 200),
      minutes: r.minutes && r.minutes > 0 ? clamp(Math.round(r.minutes), 1, 100 * 60) : null,
    });
  }
  return out.slice(0, opts.max ?? 5);
}
