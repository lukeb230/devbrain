"use client";

import { useEffect, useState } from "react";
import { clearNotice } from "./onboarding/actions";

// A one-shot notice. A notice can arrive on first mount (a hard redirect) or
// on a later render of the same instance (a server action's soft redirect),
// so the text is synced whenever a notice is present, and the cookie
// expired, so a later refresh with no cookie leaves the banner up until the
// person closes it.
export function NoticeOnce({ text }: { text: string | null }) {
  const [shown, setShown] = useState<string | null>(text);
  useEffect(() => {
    if (!text) return;
    setShown(text);
    void clearNotice();
  }, [text]);
  if (!shown) return null;
  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-2 text-[12.5px] text-stop">
      <span className="min-w-0 flex-1">{shown}</span>
      <button type="button" onClick={() => setShown(null)} aria-label="Dismiss" className="rounded px-1.5 text-[13px] leading-none text-stop hover:bg-row2">×</button>
    </div>
  );
}
