import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

// Errors thrown while rendering pages and server components. API routes wrapped in route()
// return a 500 instead of throwing; those are reported through console.error (see
// sentry.server.config.ts).
export const onRequestError = Sentry.captureRequestError;
