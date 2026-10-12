export type Chunk = { text: string; offset: number };

type Span = { start: number; end: number };

/** Paragraph spans (separated by blank lines), trimmed of surrounding whitespace. */
function paragraphs(text: string): Span[] {
  const out: Span[] = [];
  const sep = /\n[ \t]*\n+/g;
  let start = 0;
  for (const m of text.matchAll(sep)) {
    out.push({ start, end: m.index! });
    start = m.index! + m[0].length;
  }
  out.push({ start, end: text.length });
  return out.filter((p) => text.slice(p.start, p.end).trim());
}

/** Splits a span that is too long at sentence ends, falling back to a hard cut. */
function splitLong(text: string, span: Span, max: number): Span[] {
  const out: Span[] = [];
  let start = span.start;
  while (span.end - start > max) {
    const window = text.slice(start, start + max);
    let cut = -1;
    for (const m of window.matchAll(/[.!?]["')\]]?\s+/g)) cut = m.index! + m[0].length;
    if (cut < max / 4) cut = Math.max(window.lastIndexOf("\n"), window.lastIndexOf(" ")) + 1;
    if (cut <= 0) cut = max;
    out.push({ start, end: start + cut });
    start += cut;
  }
  out.push({ start, end: span.end });
  return out;
}

/**
 * Splits long text into chunks of at most `max` characters along paragraph (then sentence)
 * boundaries. Each chunk after the first repeats the previous chunk's last paragraph so an
 * item split across a boundary is still seen whole. Offsets point into the original text.
 */
export function chunkText(text: string, max = 16_000): Chunk[] {
  if (text.length <= max) return [{ text, offset: 0 }];
  const units = paragraphs(text).flatMap((p) =>
    p.end - p.start > max ? splitLong(text, p, max) : [p],
  );

  const chunks: Span[] = [];
  let current: Span | null = null;
  let lastUnit: Span | null = null;
  for (const u of units) {
    if (current && u.end - current.start <= max) {
      current.end = u.end;
    } else {
      if (current) chunks.push(current);
      // Overlap: start with the previous paragraph when it's small enough to fit.
      const overlap: Span | null =
        lastUnit && lastUnit.end - lastUnit.start <= max / 4 && u.end - lastUnit.start <= max
          ? lastUnit
          : null;
      current = { start: overlap ? overlap.start : u.start, end: u.end };
    }
    lastUnit = u;
  }
  if (current) chunks.push(current);
  return chunks.map((c) => ({ text: text.slice(c.start, c.end), offset: c.start }));
}
