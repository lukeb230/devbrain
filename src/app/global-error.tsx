"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import "./globals.css";

// The last net: a render error in the root layout itself. Next replaces the
// whole document with this, so it must carry its own <html>/<body>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <main className="mx-auto flex min-h-screen max-w-[560px] flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-[22px] font-semibold">Something broke on our side. It&apos;s been reported.</h1>
          <p className="text-[14px] text-slate-600">Reload the page, or go back to the homepage.</p>
          <div className="flex gap-3">
            <button onClick={reset} className="rounded-lg bg-[#c9554a] px-4 py-2 text-[13px] font-semibold text-white">Reload</button>
            <a href="/" className="rounded-lg border border-slate-300 px-4 py-2 text-[13px] font-semibold">Homepage</a>
          </div>
        </main>
      </body>
    </html>
  );
}
