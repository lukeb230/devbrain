"use client";

// Live refresher: subscribes to Supabase Realtime changes for this repo and
// re-renders the server component data via router.refresh() (debounced).
//
// CRITICAL FIX: with RLS enabled, postgres_changes subscriptions connect fine
// but deliver ZERO events unless the user's JWT is explicitly passed to the
// realtime client (otherwise it authorizes as anon and sees no rows). We call
// realtime.setAuth() with the session token before subscribing, and keep it
// fresh on auth refresh. A 5s poll remains as a belt-and-braces fallback.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

const TABLES = ["prs", "branches", "activity", "sessions", "claims", "restore_points", "tasks"];

export function Live({ repoId }: { repoId: string }) {
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
      // Hand the user's JWT to the realtime socket BEFORE subscribing, so RLS
      // authorizes event delivery as this user rather than anon.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (cancelled) return;

      channel = supabase.channel(`repo-${repoId}`);
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
    })();

    // Keep realtime auth fresh across token refreshes.
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) supabase.realtime.setAuth(session.access_token);
    });

    // Fallback poll: even if realtime misbehaves, the page is ≤5s stale.
    const interval = setInterval(() => router.refresh(), 5_000);

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      authSub.subscription.unsubscribe();
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
            ? "bg-emerald-500 animate-pulse"
            : status === "connecting"
              ? "bg-amber-400"
              : "bg-slate-300")
        }
      />
      {status === "live" ? "live" : status === "connecting" ? "connecting…" : "offline (polling)"}
    </span>
  );
}
