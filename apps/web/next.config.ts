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

export default nextConfig;
