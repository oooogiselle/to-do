/**
 * Sentry settings shared by the server, edge and browser runtimes.
 *
 * Errors only: no tracing, no session replay (it would record users' tasks and events), and no
 * default PII (no IP addresses, cookies or request bodies). Server code tags events with the
 * Supabase user id only. Sentry stays off unless a DSN is configured, so local dev sends nothing.
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  tracesSampleRate: 0,
};
