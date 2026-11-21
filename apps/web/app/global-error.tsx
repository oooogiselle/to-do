"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Replaces the root layout when it crashes, so it renders its own <html>.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 40 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: 8, color: "#666" }}>
          The error has been reported. Reload the page to try again.
        </p>
      </body>
    </html>
  );
}
