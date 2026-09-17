"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// The 440px panel threw while rendering. Small, one action: reload the panel.
export default function WidgetError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-ink px-5 text-center">
      <p className="text-[13.5px] font-semibold text-txt">The panel hit an error. It&apos;s been reported.</p>
      <button onClick={reset} className="rounded-lg bg-accent2 px-3.5 py-1.5 font-display text-[12.5px] font-semibold text-white hover:opacity-90">Reload</button>
    </div>
  );
}
