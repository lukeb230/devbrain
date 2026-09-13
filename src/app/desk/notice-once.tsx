"use client";

import { useEffect } from "react";
import { clearNotice } from "./onboarding/actions";

// Renders a one-shot notice and expires its cookie on first paint, so the
// next navigation (or the 5 s wall refresh) does not repeat it.
export function NoticeOnce({ text }: { text: string }) {
  useEffect(() => { void clearNotice(); }, []);
  return <div className="flex-shrink-0 border-b border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-4 py-2 text-[12.5px] text-stop">{text}</div>;
}
