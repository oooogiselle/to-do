import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry/options";

Sentry.init({
  ...sentryOptions,
  // Background work (after() jobs, the gcal cron, webhooks) catches its errors and logs them
  // with console.error, so report those too.
  integrations: [Sentry.captureConsoleIntegration({ levels: ["error"] })],
});
