import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry/options";

Sentry.init({
  ...sentryOptions,
  // Send events through the app's own domain (app/monitoring/route.ts), so ad blockers don't
  // drop them.
  tunnel: "/monitoring",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
