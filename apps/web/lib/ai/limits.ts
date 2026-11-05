import "server-only";
import { HttpError } from "@/lib/api";
import { adminClient } from "@/lib/supabase/admin";

/**
 * Cost protection for every AI call. Call `assertAiAllowed` once, up front, before any Claude
 * request (callers that fan out several requests still call it once). It checks, cheapest first:
 *   1. a per-user request rate (per minute and per hour), counted at entry so parallel requests
 *      are counted too;
 *   2. the user's monthly spend;
 *   3. a global monthly ceiling across all users, which is what bounds the damage from many
 *      throwaway accounts (a per-user cap alone can't).
 * Every failure is a 429 with a message the UI can show as is.
 */

export type AiFeature = "breakdown" | "extract" | "suggest";
type Tier = "free"; // add "pro" here when subscriptions exist

type FeatureLimit = { perMinute: number; perHour: number };

// The numbers live in one place, keyed by tier, so a paid tier only adds a row.
const LIMITS: Record<Tier, Record<AiFeature, FeatureLimit>> = {
  free: {
    breakdown: { perMinute: 6, perHour: 60 },
    extract: { perMinute: 3, perHour: 20 }, // imports from text and from a syllabus
    suggest: { perMinute: 10, perHour: 120 },
  },
};

/** Which limits apply to this user. Everyone is on the free tier until subscriptions exist. */
async function tierFor(_userId: string): Promise<Tier> {
  return "free";
}

/** Monthly AI spend per user, in USD. Free is set by env; a paid tier would return its own. */
function monthlyCapUsd(_tier: Tier): number {
  return Number(process.env.AI_MONTHLY_CAP_USD || 1);
}

/** Monthly AI spend across all users, in USD. Switches AI off for everyone when reached. */
function globalCapUsd(): number {
  return Number(process.env.AI_GLOBAL_MONTHLY_CAP_USD || 25);
}

async function underRateLimit(
  userId: string,
  feature: AiFeature,
  windowSeconds: number,
  max: number,
): Promise<boolean> {
  const { data, error } = await adminClient().rpc("hit_rate_limit", {
    p_user: userId,
    p_bucket: `${feature}:${windowSeconds}`,
    p_window_seconds: windowSeconds,
    p_max: max,
  });
  if (error) throw new Error(error.message);
  return data;
}

async function spentSince(since: Date, userId?: string): Promise<number> {
  const { data, error } = await adminClient().rpc("ai_spend", {
    p_since: since.toISOString(),
    p_user: userId,
  });
  if (error) throw new Error(error.message);
  return Number(data);
}

export async function assertAiAllowed(userId: string, feature: AiFeature): Promise<void> {
  const tier = await tierFor(userId);
  const limit = LIMITS[tier][feature];

  if (!(await underRateLimit(userId, feature, 60, limit.perMinute))) {
    throw new HttpError(429, "You're going a bit fast. Wait a minute and try again.");
  }
  if (!(await underRateLimit(userId, feature, 3600, limit.perHour))) {
    throw new HttpError(429, "You've reached the hourly limit for this feature. Try again later.");
  }

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const cap = monthlyCapUsd(tier);
  if ((await spentSince(monthStart, userId)) >= cap) {
    throw new HttpError(429, `This month's AI budget ($${cap}) is used up. It resets on the 1st.`);
  }
  if ((await spentSince(monthStart)) >= globalCapUsd()) {
    throw new HttpError(
      429,
      "AI features are paused for everyone until the 1st, because this month's overall AI budget is used up.",
    );
  }
}
