"use client";

// WidgetNotifier — native desktop notifications, driven by Supabase realtime.
// Lives inside the widget webview, which keeps running while the panel is
// hidden, so notifications arrive even when the panel is closed.
//
// Delivery: Tauri's notification plugin when running inside the shell
// (window.__TAURI__.notification), falling back to the web Notification API
// in a plain browser. Prefs live in localStorage and are edited from the
// Settings view; a same-window "devbrain-prefs" event triggers a re-read.

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export const PREFS_KEY = "devbrain_notif_prefs";
export const PREFS_EVENT = "devbrain-prefs";

export interface NotifPrefs {
  enabled: boolean;
  broadcasts: boolean;
  pr_conflicts: boolean;
  pr_approvals: boolean;
  p1_tasks: boolean;
  handoffs: boolean;
  task_autocomplete: boolean;
  merge_lights: boolean;
  specs: boolean;
}

export const DEFAULT_PREFS: NotifPrefs = {
  enabled: true,
  broadcasts: true,
  pr_conflicts: true,
  pr_approvals: true,
  p1_tasks: true,
  handoffs: true,
  task_autocomplete: true,
  merge_lights: true,
  specs: true,
};

export function readPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifPrefs>) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writePrefs(p: NotifPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    window.dispatchEvent(new CustomEvent(PREFS_EVENT));
  } catch {
    /* private mode etc. — prefs just don't persist */
  }
}

// ---------------------------------------------------------------------------

interface TauriNotification {
  isPermissionGranted(): Promise<boolean>;
  requestPermission(): Promise<string>;
  sendNotification(opts: { title: string; body?: string }): void;
}

function tauriNotif(): TauriNotification | null {
  const t = (window as unknown as { __TAURI__?: { notification?: TauriNotification } }).__TAURI__;
  return t?.notification ?? null;
}

async function deliver(title: string, body: string) {
  const tn = tauriNotif();
  if (tn) {
    try {
      let ok = await tn.isPermissionGranted();
      if (!ok) ok = (await tn.requestPermission()) === "granted";
      if (ok) tn.sendNotification({ title, body });
      return;
    } catch {
      /* fall through to web API */
    }
  }
  if (typeof Notification !== "undefined") {
    try {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") new Notification(title, { body });
    } catch {
      /* no delivery channel — silent */
    }
  }
}

// Fired from the Settings view so users can confirm delivery end to end
// (shell permission included) with one click.
export async function testNotification() {
  await deliver("DevBrain", "Notifications are working.");
}

// ---------------------------------------------------------------------------

export interface PrSeed {
  repo_id: string;
  number: number;
  mergeable_state: string | null;
  review_state: string | null;
}

export function WidgetNotifier({ self, prSeeds }: { self: string | null; prSeeds: PrSeed[] }) {
  const prefs = useRef<NotifPrefs>(DEFAULT_PREFS);
  // Last-known PR states, seeded from server data so already-dirty /
  // already-approved PRs don't fire on their next unrelated update.
  const prState = useRef<Map<string, { dirty: boolean; approved: boolean }>>(new Map());
  const seeded = useRef(false);

  if (!seeded.current) {
    seeded.current = true;
    for (const p of prSeeds) {
      prState.current.set(`${p.repo_id}#${p.number}`, {
        dirty: p.mergeable_state === "dirty",
        approved: p.review_state === "approved",
      });
    }
  }

  useEffect(() => {
    prefs.current = readPrefs();
    const onPrefs = () => {
      prefs.current = readPrefs();
    };
    window.addEventListener(PREFS_EVENT, onPrefs);

    const supabase = supabaseBrowser();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const isSelf = (name: unknown) =>
      Boolean(self && typeof name === "string" && name.toLowerCase() === self.toLowerCase());

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) await supabase.realtime.setAuth(session.access_token);
      if (cancelled) return;

      channel = supabase.channel("widget-notify");

      // Broadcasts + auto-completed tasks (events INSERT)
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (msg) => {
          const p = prefs.current;
          if (!p.enabled) return;
          const row = msg.new as {
            kind?: string;
            payload?: { text?: string; by?: string; task?: string; pr?: number };
          };
          if (row.kind === "broadcast" && p.broadcasts) {
            const by = row.payload?.by ?? "someone";
            if (isSelf(by)) return;
            deliver(`Broadcast from ${by}`, row.payload?.text ?? "");
          }
          if (row.kind === "task_auto" && p.task_autocomplete) {
            deliver(
              "Task completed by merge",
              `"${row.payload?.task ?? "a task"}" — PR #${row.payload?.pr ?? "?"}`,
            );
          }
          // Cleared-to-land: only the author gets tapped — it's THEIR merge.
          if (row.kind === "pr_cleared" && p.merge_lights) {
            const author = (row.payload as { author?: string })?.author;
            if (author && isSelf(author)) {
              deliver(
                `PR #${row.payload?.pr ?? "?"} cleared to land`,
                "Approved, conflict-free, and it's your turn — press merge.",
              );
            }
          }
          if (row.kind === "spec_ready" && p.specs) {
            const d = (row.payload ?? {}) as { title?: string; total?: number; missing?: number; conflict?: number };
            const bits = [`${d.total ?? 0} requirements`];
            if (d.missing) bits.push(`${d.missing} not built`);
            if (d.conflict) bits.push(`${d.conflict} conflict${d.conflict > 1 ? "s" : ""}`);
            deliver(`Context analyzed: ${d.title ?? "spec"}`, `${bits.join(" · ")} — review on the dashboard.`);
          }
          if (row.kind === "pr_auto_merged" && p.merge_lights) {
            deliver(
              `PR #${row.payload?.pr ?? "?"} auto-merged`,
              `"${(row.payload as { title?: string })?.title ?? ""}" landed on main (writer app).`,
            );
          }
        },
      );

      // New P1 tasks
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "tasks" },
        (msg) => {
          const p = prefs.current;
          if (!p.enabled || !p.p1_tasks) return;
          const row = msg.new as { priority?: number; title?: string; created_by?: string; assigned_to?: string | null };
          if (row.priority !== 1) return;
          if (isSelf(row.created_by)) return;
          const who = row.assigned_to ? ` for ${row.assigned_to}` : "";
          deliver("New critical task" + who, row.title ?? "");
        },
      );

      // New handoffs
      channel.on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "handoffs" },
        (msg) => {
          const p = prefs.current;
          if (!p.enabled || !p.handoffs) return;
          const row = msg.new as { dev_label?: string; summary?: string };
          if (isSelf(row.dev_label)) return;
          deliver(`${row.dev_label ?? "A teammate"} left a handoff`, row.summary ?? "");
        },
      );

      // PR transitions: → conflicted, → approved. payload.old is unreliable
      // (REPLICA IDENTITY default sends only the PK), so we track last-known
      // state ourselves and notify only on a transition.
      const onPr = (msg: { new: Record<string, unknown> }) => {
        const p = prefs.current;
        if (!p.enabled) return;
        const row = msg.new as {
          repo_id?: string;
          number?: number;
          title?: string;
          author?: string | null;
          state?: string;
          mergeable_state?: string | null;
          review_state?: string | null;
        };
        if (!row.repo_id || !row.number) return;
        const key = `${row.repo_id}#${row.number}`;
        const prev = prState.current.get(key) ?? { dirty: false, approved: false };
        const now = {
          dirty: row.mergeable_state === "dirty",
          approved: row.review_state === "approved",
        };
        prState.current.set(key, now);
        if (row.state && row.state !== "open") return;
        if (p.pr_conflicts && now.dirty && !prev.dirty) {
          deliver(`PR #${row.number} has conflicts`, row.title ?? "");
        }
        if (p.pr_approvals && now.approved && !prev.approved && !isSelf(row.author)) {
          deliver(`PR #${row.number} approved`, row.title ?? "");
        }
      };
      channel.on("postgres_changes", { event: "UPDATE", schema: "public", table: "prs" }, onPr);
      channel.on("postgres_changes", { event: "INSERT", schema: "public", table: "prs" }, onPr);

      channel.subscribe();
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(PREFS_EVENT, onPrefs);
      if (channel) supabase.removeChannel(channel);
    };
    // self is stable for the lifetime of the widget page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self]);

  return null;
}
