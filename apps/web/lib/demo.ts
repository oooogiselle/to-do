import "server-only";

/**
 * `pnpm demo` runs without a real Google account. In demo mode time blocks are stored
 * locally and never written to Google Calendar.
 */
export const isDemo = () => process.env.NEXT_PUBLIC_DEMO === "1";
