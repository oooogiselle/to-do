import type { SyncResponse } from "../schemas";

const COLLECTIONS = ["lists", "tasks", "steps", "time_blocks", "day_plan_items"] as const;

type Row = { id: string; deleted_at: string | null };

/**
 * Applies a delta from `GET /sync?since=` to a snapshot. The server's copy of a row always
 * replaces ours (optimistic edits stamp client clock time, so `updated_at` can't decide), rows
 * the delta reports deleted are dropped, and rows it doesn't mention (including optimistic
 * `temp-` rows) are kept. Applying the same delta twice gives the same result.
 */
export function mergeSync<S extends SyncResponse>(prev: S, delta: SyncResponse): S {
  const out = { ...prev };
  for (const c of COLLECTIONS) {
    const changed = delta[c] as Row[];
    if (!changed.length) continue;
    const byId = new Map(changed.map((r) => [r.id, r]));
    const rows: Row[] = [];
    for (const r of prev[c] as Row[]) {
      const next = byId.get(r.id);
      if (!next) rows.push(r);
      else {
        byId.delete(r.id);
        if (!next.deleted_at) rows.push(next);
      }
    }
    for (const r of byId.values()) if (!r.deleted_at) rows.push(r);
    (out as Record<string, unknown>)[c] = rows;
  }
  // The route sends settings only when they changed since the cursor.
  out.settings = delta.settings ?? prev.settings;
  out.cursor = delta.cursor > prev.cursor ? delta.cursor : prev.cursor;
  return out;
}
