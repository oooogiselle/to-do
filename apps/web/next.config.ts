import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tt/client", "@tt/shared"],
  // The to-dos page used to be called Inbox; keep old links and bookmarks working.
  redirects: async () => [
    { source: "/inbox", destination: "/to-dos", permanent: true },
    { source: "/today", destination: "/calendar", permanent: true },
    { source: "/workspace", destination: "/calendar", permanent: true },
  ],
};

// Uploads source maps during production builds when SENTRY_AUTH_TOKEN, SENTRY_ORG and
// SENTRY_PROJECT are set (the Vercel Sentry integration sets them). Without them the build
// just skips the upload.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  widenClientFileUpload: true,
  // Send browser events through the app's own domain, so ad blockers don't drop them.
  tunnelRoute: "/monitoring",
});
