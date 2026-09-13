"use client";

import { useEffect, useState } from "react";
import { clearNotice } from "./onboarding/actions";

// A one-shot notice. The layout passes whatever the cookie says on THIS
// render; we latch it on first mount and expire the cookie, so a later
// server refresh (the wall polls every 5 s) rendering with no cookie does
// not unmount the banner under the reader. The person closes it.
export function NoticeOnce({ text }: { text: string | null }) {
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => { if (text) void clearNotice(); }, [text]);
  if (!shown) return null;
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-2 text-[12.5px] text-stop">
      <span className="min-w-0 flex-1">{shown}</span>
      <button type="button" onClick={() => setShown(null)} aria-label="Dismiss" className="rounded px-1.5 text-[13px] leading-none text-stop hover:bg-row2">×</button>
    </div>
  );
}
