"use client";

import * as Sentry from "@sentry/nextjs";
import Link from "next/link";
import { useEffect } from "react";

// A Console page that threw while rendering. The shell (sidebar, title bar)
// stays; this fills the page area. Retry re-renders the segment.
export default function DeskError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="font-display text-[20px] font-medium text-txt">This page hit an error. It&apos;s been reported.</h2>
      <p className="max-w-[46ch] text-[13px] text-muted">Try again, or go back to the Console home. If it keeps happening, tell us on Help.</p>
      <div className="flex gap-2.5">
        <button onClick={reset} className="rounded-lg bg-accent2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-white hover:opacity-90">Retry</button>
        <Link href="/desk" className="rounded-lg border border-line2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-txt hover:border-line3">Console home</Link>
      </div>
    </div>
  );
}
