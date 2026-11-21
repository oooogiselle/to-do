import { withSentryConfig } from "@sentry/nextjs/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tt/client", "@tt/shared"],
  // The to-dos page used to be called Inbox; keep old links and bookmarks working.
  // Baseline hardening for every response. No full CSP yet: it needs care around Next.js inline
  // scripts and Sentry. frame-ancestors / X-Frame-Options stop the app being framed
  // (clickjacking, e.g. a hidden "Delete account" button).
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ],
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
});
