"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

// Replaces the root layout when it crashes, so it renders its own <html> and loads the Loom tokens itself.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="p-10 font-sans">
        <h1 className="text-[18px] font-semibold text-ink">Something went wrong</h1>
        <p className="mt-2 text-[13px] text-muted">
          The error has been reported. Reload the page to try again.
        </p>
      </body>
    </html>
  );
}
