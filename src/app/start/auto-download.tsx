"use client";
import { useEffect, useRef } from "react";

// Starts the DMG download once the page has painted. /download answers with a
// 302 to a GitHub release asset served as an attachment, so assigning
// location.href downloads the file and leaves this page in place. The ref
// guards React's development double-mount so nobody gets two DMGs.
export function AutoDownload({ enabled }: { enabled: boolean }) {
  const fired = useRef(false);
  useEffect(() => {
    if (!enabled || fired.current) return;
    fired.current = true;
    const t = window.setTimeout(() => window.location.assign("/download"), 600);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return enabled ? <span hidden data-autodownload="1" /> : null;
}
