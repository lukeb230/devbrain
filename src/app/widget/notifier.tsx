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
  /** Which repos may notify: every linked repo, or only the one the widget
   *  is scoped to. Defaults to "all" — a silent P1 on the repo you're NOT
   *  looking at is the expensive failure. */
  scope: "all" | "repo";
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
  scope: "all",
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

export type DeliveryResult =
  | { ok: true; via: "native" | "plugin" | "web"; native_error?: string }
  | { ok: false; reason: "denied" | "unsupported" | "error"; detail?: string };

type TauriCore = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
function tauriCore(): TauriCore | null {
  const t = (window as unknown as { __TAURI__?: { core?: TauriCore } }).__TAURI__;
  return t?.core ?? null;
}

// Delivery order:
//   1. The shell's native `notify` command (UNUserNotificationCenter) —
//      the only path that works on macOS 26; shells ≥0.2.11 have it.
//   2. Tauri's notification plugin (older shells; dead on macOS 26).
//   3. The web Notification API (plain browser).
async function deliver(title: string, body: string): Promise<DeliveryResult> {
  const core = tauriCore();
  // Why the native path was skipped (if it was) — shown in the test feedback.
  let nativeError: string | undefined = core ? undefined : "window.__TAURI__.core missing";
  if (core) {
    try {
      const r = String(await core.invoke("notify", { title, body }));
      if (r === "delivered") return { ok: true, via: "native" };
      if (r === "denied") return { ok: false, reason: "denied" };
      if (r.startsWith("unsupported")) nativeError = r;
      else return { ok: false, reason: "error", detail: r.replace(/^error:\s*/, "") };
    } catch (e) {
      // Command missing on an older shell, or blocked — fall through, but remember why.
      nativeError = e instanceof Error ? e.message : String(e);
    }
  }
  const tn = tauriNotif();
  if (tn) {
    try {
      let ok = await tn.isPermissionGranted();
      if (!ok) ok = (await tn.requestPermission()) === "granted";
      if (ok) { tn.sendNotification({ title, body }); return { ok: true, via: "plugin", native_error: nativeError }; }
      return { ok: false, reason: "denied", detail: nativeError };
    } catch {
      /* fall through to web API */
    }
  }
  if (typeof Notification !== "undefined") {
    try {
      if (Notification.permission === "default") await Notification.requestPermission();
      if (Notification.permission === "granted") { new Notification(title, { body }); return { ok: true, via: "web" }; }
      return { ok: false, reason: "denied" };
    } catch {
      /* no delivery channel */
    }
  }
  return { ok: false, reason: "unsupported" };
}

/** Deep-link to System Settings → Notifications (shell ≥0.2.11); no-op elsewhere. */
export function openNotificationSettings() {
  void tauriCore()?.invoke("open_notification_settings").catch(() => {});
}

// Fired from the Settings view so users can confirm delivery end to end
// (shell permission included) with one click — and learn why if it fails.
export async function testNotification(): Promise<DeliveryResult> {
  return deliver("DevBrain", "Notifications are working.");
}

// ---------------------------------------------------------------------------

export interface PrSeed {
  repo_id: string;
  number: number;
  mergeable_state: string | null;
  review_state: string | null;
}

export function WidgetNotifier({
  self,
  prSeeds,
  activeRepoId,
}: {
  self: string | null;
  prSeeds: PrSeed[];
  activeRepoId: string | null;
}) {
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
    // Repo gate: with scope="repo", only the widget's active repo may notify.
    const inScope = (repoId: unknown) =>
      prefs.current.scope !== "repo" || !activeRepoId || repoId === activeRepoId;

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
            repo_id?: string;
            payload?: { text?: string; by?: string; task?: string; pr?: number };
          };
          if (!inScope(row.repo_id)) return;
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
          const row = msg.new as { repo_id?: string; priority?: number; title?: string; created_by?: string; assigned_to?: string | null };
          if (!inScope(row.repo_id)) return;
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
          const row = msg.new as { repo_id?: string; dev_label?: string; summary?: string };
          if (!inScope(row.repo_id)) return;
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
        if (!inScope(row.repo_id)) return;
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
    // self/activeRepoId are stable for a given render of the widget page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [self, activeRepoId]);

  return null;
}
