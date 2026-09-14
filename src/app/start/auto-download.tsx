"use client";
import { useEffect } from "react";

// Starts the DMG download once the page has painted. /download answers with a
// 302 to a GitHub release asset served as an attachment, so assigning
// location.href downloads the file and leaves this page in place. No ref
// guard: the cleanup alone is what keeps this to one download. StrictMode's
// simulated dev unmount schedules the timeout, clears it, then the effect
// re-runs and schedules it again, so dev and production both fire exactly
// once. A ref guard here would make the clear-and-rerun a no-op, since the
// second run would see it already "fired" and never reschedule.
export function AutoDownload({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => window.location.assign("/download"), 600);
    return () => window.clearTimeout(t);
  }, [enabled]);
  return enabled ? <span hidden data-autodownload="1" /> : null;
}
