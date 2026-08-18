"use client";

// Widget refresher — realtime + fallback poll, but VISIBILITY-AWARE: when
// the panel is hidden (widget closed / tab backgrounded) polling stops
// completely, so the idle widget costs ~zero. Realtime resubscribes and an
// immediate refresh fires when the panel becomes visible again.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABLES = ["prs", "branches", "activity", "sessions", "events", "tasks", "linked_repos"];

export function WidgetLive() {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let cancelled = false;

    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 300);
    };

    const startPoll = () => {
      if (poll.current) return;
      poll.current = setInterval(() => {
        if (!document.hidden) router.refresh();
      }, 5_000);
    };
    const stopPoll = () => {
      if (poll.current) {
        clearInterval(poll.current);
        poll.current = null;
      }
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

    const onVisibility = () => {
      if (document.hidden) {
        stopPoll();
      } else {
        router.refresh(); // catch up instantly on open
        startPoll();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) startPoll();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", onVisibility);
      stopPoll();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
      <span
        className={
          "h-1.5 w-1.5 rounded-full " +
          (status === "live"
            ? "bg-emerald-500 animate-pulse"
            : status === "connecting"
              ? "bg-amber-400"
              : "bg-slate-300")
        }
      />
      {status === "live" ? "live" : status === "connecting" ? "connecting" : "polling"}
    </span>
  );
}
