"use client";

import * as Sentry from "@sentry/nextjs";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <main className="grid min-h-screen place-items-center bg-[#F7FAFC] px-6 py-10 font-sans">
          <section className="w-full max-w-xl rounded-lg border border-[#D8E2EC] bg-[#FBFCFE] px-8 py-9 text-center shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9A6510]">
              System error
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#122033]">
              Something interrupted this page
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#52657A]">
              The issue has been recorded. Refresh the page to retry the last action.
            </p>
            <button
              type="button"
              className="mt-7 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-[#29639F] px-4 text-sm font-medium text-white transition-colors hover:bg-[#1f4f80]"
              onClick={() => window.location.reload()}
            >
              <RefreshCw className="size-4" />
              Refresh page
            </button>
            {error.digest && (
              <p className="mt-4 text-xs text-[#7B8CA0]">Reference: {error.digest}</p>
            )}
          </section>
        </main>
      </body>
    </html>
  );
}
