"use client";

// Widget refresher — realtime + fallback poll, visibility-aware: polling
// stops entirely while the panel is hidden; reopening triggers an instant
// catch-up refresh.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABLES = ["prs", "branches", "activity", "sessions", "events", "tasks", "handoffs", "claims", "linked_repos", "pr_reviews", "digests"];

export function WidgetLive() {
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
      channel = supabase.channel("widget");
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
    const onVisibility = () => { if (!document.hidden) router.refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return (
    <span
      className={
        "inline-block h-1.5 w-1.5 rounded-full " +
        (status === "live" ? "bg-emerald-500 animate-pulse" : status === "connecting" ? "bg-amber-400" : "bg-slate-300")
      }
      title={status}
    />
  );
}
