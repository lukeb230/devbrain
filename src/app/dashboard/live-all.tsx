"use client";

// Org-wide live refresher for the team home: realtime (RLS-scoped, unfiltered)
// + 5s fallback poll.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABLES = ["prs", "branches", "activity", "sessions", "claims", "events", "linked_repos", "policies", "tasks"];

export function LiveAll() {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;
      channel = supabase.channel("org-home");
      for (const table of TABLES) {
        channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
      }
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("live");
        if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("off");
      });
    })();
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });
    const interval = setInterval(() => { if (!document.hidden) router.refresh(); }, 5_000);
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span className={"h-2 w-2 rounded-full " + (status === "live" ? "bg-emerald-500 animate-pulse" : status === "connecting" ? "bg-amber-400" : "bg-slate-300")} />
      {status === "live" ? "live" : status === "connecting" ? "connecting…" : "offline (polling)"}
    </span>
  );
}
