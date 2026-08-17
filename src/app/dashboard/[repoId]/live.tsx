"use client";

// Live refresher: subscribes to Supabase Realtime changes for this repo and
// re-renders the server component data via router.refresh() (debounced).
// This is what makes the dashboard "live" without any refresh button.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABLES = ["prs", "branches", "activity", "sessions", "claims", "restore_points"];

export function Live({ repoId }: { repoId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<"connecting" | "live" | "off">("connecting");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => router.refresh(), 400);
    };

    const channel = supabase.channel(`repo-${repoId}`);
    for (const table of TABLES) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `repo_id=eq.${repoId}` },
        refresh,
      );
    }
    channel.subscribe((s) => {
      if (s === "SUBSCRIBED") setStatus("live");
      if (s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED") setStatus("off");
    });

    // Fallback: refresh every 60s even if realtime hiccups.
    const interval = setInterval(() => router.refresh(), 60_000);
    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [repoId, router]);

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span
        className={
          "h-2 w-2 rounded-full " +
          (status === "live"
            ? "bg-emerald-400 animate-pulse"
            : status === "connecting"
              ? "bg-amber-400"
              : "bg-slate-600")
        }
      />
      {status === "live" ? "live" : status === "connecting" ? "connecting…" : "offline (auto-retry)"}
    </span>
  );
}
