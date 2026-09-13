"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The it's-working check must flip on its own the moment a session is seen —
// the user should never type a command to find out. Re-render every 5 s
// while `active`; the server re-derives the state each time.
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
