/**
 * Planning for the Google Calendar cron (`/api/cron/gcal`): which calendars to poll, which push
 * channels to renew, in what order, and how to run the work inside a time budget. Pure, so the
 * rules are tested without Google or a database.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Poll interval for a calendar with no live push channel: push isn't covering it. */
export const POLL_WITHOUT_CHANNEL_MS = 15 * MIN;
/** Safety-net poll for a calendar with a live channel, in case a notification was missed. */
export const POLL_WITH_CHANNEL_MS = 6 * HOUR;
/** Renew channels this close to expiry (Google caps them at about 7 days). */
export const RENEW_BEFORE_MS = 48 * HOUR;

export type CronCalendar = { user_id: string; calendar_id: string };
export type CronSyncState = {
  user_id: string;
  calendar_id: string;
  last_synced_at: string | null;
  channel_id: string | null;
  channel_expires_at: string | null;
};
export type CronWorkItem = CronCalendar & {
  sync: boolean;
  watch: boolean;
  /** When it last synced (ms), or null if never: the most overdue go first. */
  lastSyncedMs: number | null;
};

/** A channel counts as live until it expires. */
function liveChannel(s: CronSyncState | undefined, now: number): boolean {
  return !!s?.channel_id && !!s.channel_expires_at && Date.parse(s.channel_expires_at) > now;
}

/**
 * Work for one cron run, most overdue first (never synced, then oldest sync). A calendar with no
 * live channel is polled every 15 minutes; one with a live channel only every 6 hours, since
 * push already delivers its changes. With push enabled, missing or expiring channels are renewed.
 */
export function planCronWork(
  calendars: CronCalendar[],
  states: CronSyncState[],
  now: number,
  pushEnabled: boolean,
): CronWorkItem[] {
  const stateOf = new Map(states.map((s) => [`${s.user_id}\u0000${s.calendar_id}`, s]));
  const items: CronWorkItem[] = [];
  for (const c of calendars) {
    const s = stateOf.get(`${c.user_id}\u0000${c.calendar_id}`);
    const lastSyncedMs = s?.last_synced_at ? Date.parse(s.last_synced_at) : null;
    const live = pushEnabled && liveChannel(s, now);
    const interval = live ? POLL_WITH_CHANNEL_MS : POLL_WITHOUT_CHANNEL_MS;
    const sync = lastSyncedMs === null || now - lastSyncedMs > interval;
    const watch =
      pushEnabled &&
      (!s?.channel_id ||
        !s.channel_expires_at ||
        Date.parse(s.channel_expires_at) - now < RENEW_BEFORE_MS);
    if (sync || watch) items.push({ ...c, sync, watch, lastSyncedMs });
  }
  return items.sort((a, b) => (a.lastSyncedMs ?? -Infinity) - (b.lastSyncedMs ?? -Infinity));
}

/** Groups work by user, keeping the most overdue user first. */
export function groupByUser(items: CronWorkItem[]): { user_id: string; items: CronWorkItem[] }[] {
  const groups = new Map<string, CronWorkItem[]>();
  for (const it of items) {
    const g = groups.get(it.user_id);
    if (g) g.push(it);
    else groups.set(it.user_id, [it]);
  }
  return [...groups].map(([user_id, items]) => ({ user_id, items }));
}

export type BudgetResult = { started: number; skipped: number };

/**
 * Runs `worker` over `units`, at most `concurrency` at a time, and stops starting new units once
 * `deadline` has passed (units already running finish). The worker handles its own errors; a
 * throw is caught so one bad unit can't stop the rest.
 */
export async function runWithBudget<T>(
  units: T[],
  worker: (unit: T) => Promise<void>,
  opts: { concurrency: number; deadline: number; now?: () => number },
): Promise<BudgetResult> {
  const now = opts.now ?? Date.now;
  let next = 0;
  let started = 0;
  const lane = async () => {
    while (next < units.length && now() < opts.deadline) {
      const unit = units[next++] as T;
      started++;
      await worker(unit).catch(() => {});
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, lane));
  return { started, skipped: units.length - started };
}
