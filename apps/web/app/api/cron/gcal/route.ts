import { NextResponse, type NextRequest } from "next/server";
import { groupByUser, planCronWork, runWithBudget, type CronSyncState } from "@tt/shared";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GoogleNotConnectedError, GoogleReconnectError } from "@/lib/google";
import { syncCalendar } from "@/lib/gcal/sync";
import { pushEnabled, startWatch } from "@/lib/gcal/watch";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 300;

/** Stop starting new users after this, leaving time for running ones to finish. */
const BUDGET_MS = 240_000;
/** Users handled at once. Each user's calendars run one after another. */
const CONCURRENCY = 4;
/** Supabase caps a response at 1000 rows (`max_rows`), so load in pages. */
const PAGE = 1000;

/**
 * Fallback for push notifications (Vercel Cron, every 15 minutes): polls calendars push isn't
 * covering, safety-polls the rest every few hours, and renews watch channels before they
 * expire. Most overdue users go first, so if a run runs out of time the next one picks up where
 * it stopped. Rules: `planCronWork` in @tt/shared.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return new Response(null, { status: 401 });
  }
  const startedAt = Date.now();

  const [accounts, calendars, states] = await Promise.all([
    loadAll<{ user_id: string }>((db) =>
      db.from("google_accounts").select("user_id").eq("needs_reconnect", false).order("user_id"),
    ),
    loadAll<{ user_id: string; calendar_id: string }>((db) =>
      db
        .from("calendars")
        .select("user_id, calendar_id:id")
        .or("selected.eq.true,is_tasks_calendar.eq.true")
        .order("user_id")
        .order("id"),
    ),
    loadAll<CronSyncState>((db) =>
      db
        .from("calendar_sync_state")
        .select("user_id, calendar_id, last_synced_at, channel_id, channel_expires_at")
        .order("user_id")
        .order("calendar_id"),
    ),
  ]);

  // Accounts waiting for the user to reconnect are skipped: every call would fail.
  const connected = new Set(accounts.map((a) => a.user_id));
  const work = planCronWork(
    calendars.filter((c) => connected.has(c.user_id)),
    states,
    startedAt,
    pushEnabled(),
  );

  const counts = { synced: 0, watched: 0, failed: 0, reconnect: 0 };
  const { started, skipped } = await runWithBudget(
    groupByUser(work),
    async ({ user_id: userId, items }) => {
      for (const item of items) {
        try {
          if (item.sync) {
            await syncCalendar(userId, item.calendar_id);
            counts.synced++;
          }
          if (item.watch) {
            await startWatch(userId, item.calendar_id);
            counts.watched++;
          }
        } catch (e) {
          if (e instanceof GoogleReconnectError || e instanceof GoogleNotConnectedError) {
            // Expected: the token is gone (calendarClient flags the account). Skip the rest of
            // this user's calendars, and don't report it as an error.
            counts.reconnect++;
            return;
          }
          console.error("cron gcal", item.calendar_id, e);
          counts.failed++;
        }
      }
    },
    { concurrency: CONCURRENCY, deadline: startedAt + BUDGET_MS },
  );

  if (skipped > 0) {
    console.warn(`cron gcal: out of time, ${skipped} users left for the next run`);
  }
  return NextResponse.json({
    ok: true,
    users: started + skipped,
    ...counts,
    skippedForTime: skipped,
    ms: Date.now() - startedAt,
  });
}

type Db = ReturnType<typeof adminClient>;
type Paged = { range(from: number, to: number): PromiseLike<{ data: unknown; error: { message: string } | null }> };

/** Loads every row of an ordered query, a page at a time. */
async function loadAll<T>(query: (db: Db) => Paged): Promise<T[]> {
  const db = adminClient();
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(db).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}
