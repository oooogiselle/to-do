import { normalize } from "./text";

type Mergeable = {
  title: string;
  due_date: string | null;
  date_certain: boolean;
  source_quote: string;
};

/**
 * Drops duplicates found in overlapping chunks (same normalized title and due date),
 * keeping the copy with a certain date, then the longer source quote. Order is preserved.
 */
export function mergeExtracted<T extends Mergeable>(items: T[]): T[] {
  const best = new Map<string, { item: T; index: number }>();
  items.forEach((item, index) => {
    const key = `${normalize(item.title)}|${item.due_date ?? ""}`;
    const prev = best.get(key);
    const better =
      !prev ||
      (item.date_certain && !prev.item.date_certain) ||
      (item.date_certain === prev.item.date_certain &&
        item.source_quote.length > prev.item.source_quote.length);
    if (better) best.set(key, { item, index: prev?.index ?? index });
  });
  return [...best.values()].sort((a, b) => a.index - b.index).map((v) => v.item);
}
