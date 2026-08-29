"use client";

// The widget mini-app: a Home tab that fits the panel with NO scrolling
// (tasks + who's working — the glance content), and a bottom tab bar for
// Tasks / PRs / Brain / Feed. Tab switches are instant (pure client state).

import React, { useEffect, useRef, useState, useTransition } from "react";
import { mintDeviceToken, setWidgetRepo } from "./actions";
import { dismissAlert } from "../settings/org/alert-actions";
import { ActivityFeed, type ActivityRow } from "@/components/ActivityFeed";
import { TaskBody } from "@/components/TaskBody";
import { BrainMark } from "@/components/BrainMark";
import { Pulse } from "./pulse";
import { WidgetBrain } from "./brain";
import { PrBadges } from "@/components/PrBadges";
import { createClaim, releaseClaim } from "../dashboard/[repoId]/claim-actions";
import { TaskMenu } from "../dashboard/[repoId]/tasks/task-menu";
import { toggleRule } from "../dashboard/[repoId]/rules/actions";
import { uploadSpec } from "../dashboard/[repoId]/specs/actions";
import { assignTask, braindumpTasks, completeTask, confirmMaybeDone, createTask, dismissMaybeDone, reopenTask, startTask } from "../dashboard/[repoId]/tasks/actions";
import { BrainExplorer, type NotePayload } from "../dashboard/[repoId]/brain/explorer";
import type { GEdge, GNode } from "../dashboard/[repoId]/brain/graph";
import { WidgetBadge } from "./badge";
import { WidgetLive } from "./live";
import {
  DEFAULT_PREFS,
  readPrefs,
  testNotification,
  openNotificationSettings,
  type DeliveryResult,
  WidgetNotifier,
  writePrefs,
  type NotifPrefs,
} from "./notifier";

export interface WidgetData {
  deploy: string;
  sessions: { id: string; repo: string; dev_label: string; summary: string | null; last_seen: string }[];
  collisions: { repo: string; file: string; branches: string[] }[];
  prs: { repo_id: string; repo: string; defaultBranch: string; number: number; title: string; author: string | null; review_state: string | null; draft: boolean; mergeable_state: string | null; html_url: string | null; ai: { verdict: string; summary: string } | null; light: { state: string; reason: string } | null }[];
  tasks: { id: string; repo_id: string; repo: string; title: string; detail: string | null; priority: number; tags: string[]; assigned_to: string | null; status: string; done_by: string | null; created_by: string | null; created_at: string; maybe_done_pr: number | null; started_by: string | null; footprint: string[] | null }[];
  claims: { id: string; repo_id: string; repo: string; dev_label: string; paths: string[]; note: string | null; expires_at: string | null }[];
  members: string[];
  feed: { kind: string; text: string; by: string | null; at: string }[];
  journals: { id: string; repo: string; by: string; branch: string | null; summary: string; learned: string[]; tried_and_failed: string[]; remaining: string | null; at: string }[];
  handoffs: { id: string; repo: string; by: string | null; branch: string | null; summary: string; remaining: string | null; at: string }[];
  alerts: { id: string; severity: string; title: string; count: number }[];
  canAdmin: boolean;          // owner/admin of the active org — gates rule toggles + reminders mapping
  notice: string | null;      // ?error= code after a refused action (see Notice)
  activity: ActivityRow[];
  brain: { notes: NotePayload[]; nodes: GNode[]; edges: GEdge[]; repoId: string; repoName: string } | null;
  lastRepo: { id: string; name: string } | null;
  conflicted: number;
  rules: { rule: string; label: string; on: boolean }[];
  self: string | null;
  repos: { id: string; name: string; full_name: string }[];
  scopeAll: boolean;
  digest: { day: string; body: string; repo: string } | null;
  mergePlan: { repo: string; order: { number: number; title: string; reason: string }[] } | null;
}

const LIGHT_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-400",
  red: "bg-red-500",
  gray: "bg-slate-300",
};

const AI_CHIP: Record<string, string> = {
  looks_good: "bg-emerald-50 text-emerald-700",
  caution: "bg-amber-50 text-amber-700",
  risky: "bg-red-50 text-red-700",
  skipped: "bg-slate-100 text-slate-500",
};

const TABS = ["Home", "Tasks", "PRs", "Brain", "Feed"] as const;
type Tab = (typeof TABS)[number];
type View = Tab | "Settings";

const PRIO: Record<number, string> = {
  1: "bg-red-50 text-red-700",
  2: "bg-amber-50 text-amber-700",
  3: "bg-brand-50 text-brand-700",
  4: "bg-slate-100 text-slate-600",
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

function TaskRow({ t, compact }: { t: WidgetData["tasks"][number]; compact?: boolean }) {
  return (
    <li className="flex items-start gap-2">
      <form action={completeTask} className="mt-0.5 flex-shrink-0">
        <input type="hidden" name="repoId" value={t.repo_id} />
        <input type="hidden" name="id" value={t.id} />
        <button
          title="Mark complete"
          className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
          style={{ height: 14, width: 14 }}
        />
      </form>
      <span className={`chip mt-0.5 flex-shrink-0 px-1 py-0 text-[10px] ${PRIO[t.priority] ?? PRIO[4]}`}>P{t.priority}</span>
      <TaskBody size="sm" title={t.title} detail={t.detail} />
      {!compact && t.assigned_to && <span className="flex-shrink-0 text-[10px] text-brand-600">{t.assigned_to}</span>}
    </li>
  );
}

// ---------------------------------------------------------------------------
// First-run setup, shown inside the desktop app until ~/.devbrain/config.json
// exists. Mints a device token for the signed-in member, then asks the shell
// to bootstrap (source, CLI, plugin, hooks, updater), request notification
// permission, and take a first Reminders pass (which triggers the macOS
// Reminders prompt) — all attributed to DevBrain.app.
// ---------------------------------------------------------------------------
interface SetupState {
  configured: boolean;
  node: string;
  node_ok: boolean;
  hostname: string;
  app_version: string;
  source_present: boolean;
  has_token: boolean;
  bootstrap_ok: boolean | null;
  bootstrap_failed: string[];
  bootstrap_at: string | null;
  in_applications: boolean;
  reminders_on: boolean;
}
type StepResult = { ok: boolean; msg: string; code?: string; skipped?: boolean };
interface BootstrapResult {
  ok: boolean;
  fatal: boolean;
  failed: string[];
  steps: Record<string, StepResult> | null;
  log: string;
  exit_code: number | null;
}
const STEP_LABEL: Record<string, string> = { source: "DevBrain source", cli: "CLI", hooks: "Hooks", plugin: "Claude Code plugin", reminders: "Reminders sync", updater: "Daily updater", widget: "App" };
// What to do about a failed part, by the CLI's stable code.
function adviceFor(code: string | undefined, msg: string): string {
  switch (code) {
    case "claude_missing":
      return "Claude Code isn't installed (or not where DevBrain looks). Install it, then Retry — or in any Claude session run /plugin marketplace add lukeb230/devbrain and /plugin install devbrain@devbrain.";
    case "marketplace_add":
    case "plugin_install":
    case "plugin_update":
      return "Usually network or GitHub access. Retry, or run the two /plugin commands above in a Claude session.";
    case "source_offline":
    case "source_pull":
      return "Couldn't download DevBrain — are you online? Retry when you are.";
    default:
      return msg;
  }
}
// Per-part list rendered after a bootstrap (and on the Settings card).
function StepList({ result }: { result: BootstrapResult }) {
  const steps = result.steps ?? {};
  const names = Object.keys(steps);
  if (names.length === 0) return null;
  return (
    <ul className="space-y-1 rounded-md border border-slate-200 bg-white p-2 text-[11px]">
      {names.map((n) => {
        const st = steps[n];
        return (
          <li key={n} className="flex gap-2">
            <span className={st.ok ? (st.skipped ? "text-slate-400" : "text-emerald-600") : "text-red-600"}>{st.ok ? (st.skipped ? "·" : "✓") : "✗"}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium text-slate-800">{STEP_LABEL[n] ?? n}</span>
              <span className="text-slate-500"> — {st.msg}</span>
              {!st.ok && <div className="mt-0.5 text-red-700">{adviceFor(st.code, st.msg)}</div>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
// Re-run bootstrap without minting a token (config.json already has one).
async function rerunBootstrap(): Promise<BootstrapResult> {
  const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
  if (!core) throw new Error("not running inside the DevBrain app");
  return (await core.invoke("bootstrap", { server: window.location.origin, token: null, remindersList: null, remindersRepo: null })) as BootstrapResult;
}

function SetupScreen({ state, repos, canAdmin, onDone }: { state: SetupState; repos: WidgetData["repos"]; canAdmin: boolean; onDone: () => void }) {
  const [label, setLabel] = useState(state.hostname.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-mac");
  const [syncReminders, setSyncReminders] = useState(true);
  const [list, setList] = useState("");
  // Default the repo to the one whose name matches the list name, else the
  // first linked repo.
  const guessRepo = (l: string) => {
    const key = l.toLowerCase().replace(/[^a-z0-9]/g, "");
    return repos.find((r) => r.full_name.toLowerCase().replace(/[^a-z0-9]/g, "").includes(key))?.full_name ?? repos[0]?.full_name ?? "";
  };
  const [repo, setRepo] = useState(guessRepo(""));
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState<string[]>([]);
  const [done, setDone] = useState<null | "ok" | "fail">(null);
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const say = (l: string) => setLines((xs) => [...xs, l]);
  const core = () => (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;

  const run = async () => {
    setBusy(true); setLines([]); setDone(null); setResult(null);
    try {
      const c = core();
      if (!c) throw new Error("not running inside the DevBrain app");
      let token: string | null = null;
      if (state.has_token) {
        say("Using the token already on this Mac.");
      } else {
        say("Creating a token for this Mac…");
        const minted = await mintDeviceToken(label);
        if ("error" in minted) throw new Error(minted.error);
        say(`Token "${minted.label}" created.`);
        token = minted.token;
      }
      say("Installing the CLI, Claude Code plugin, hooks and updater…");
      const r = (await c.invoke("bootstrap", {
        server: window.location.origin,
        token,
        // "on"/"off" switches sync for this Mac; a list+repo also creates the
        // team's first mapping (Settings → Reminders holds the rest).
        remindersList: syncReminders ? (list && repo ? list : "on") : "off",
        remindersRepo: syncReminders && list && repo ? repo : null,
      })) as BootstrapResult;
      setResult(r);
      for (const l of r.log.split("\n").filter(Boolean)) say("  " + l);
      if (r.fatal) throw new Error("nothing was installed — see above");
      if (!r.ok) throw new Error(`${r.failed.map((f) => STEP_LABEL[f] ?? f).join(", ")} failed — see the list below`);
      say("Asking for notification permission (click Allow)…");
      const n = String(await c.invoke("notify", { title: "DevBrain is set up", body: "You'll get team notifications here." }));
      say(n === "delivered" ? "Notifications on." : `Notifications: ${n}.`);
      if (syncReminders) {
        say("Reading your Reminders lists (click Allow if macOS asks)…");
        const out = (await c.invoke("run_collector_now")) as string[];
        for (const l of out) say("  " + l);
      }
      say(r.steps?.plugin?.ok ? "Done. Restart any open Claude Code sessions to load the plugin." : "Done.");
      setDone("ok");
    } catch (e) {
      say("✗ " + (e instanceof Error ? e.message : String(e)));
      setDone("fail");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
        <BrainMark size={18} className="flex-shrink-0" />
        <span className="text-sm font-semibold text-slate-900">Set up DevBrain on this Mac</span>
        <span className="ml-auto text-[10px] text-slate-400">v{state.app_version}</span>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="text-xs leading-relaxed text-slate-600">
          One click installs the CLI, the Claude Code plugin (presence hooks included), the daily updater and — if you want — Reminders sync.
          macOS will ask for two permissions along the way (Notifications, Reminders). Nothing else to install
          {state.node_ok ? " — Node is bundled with the app." : "."}
        </p>
        {!state.in_applications && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            Move DevBrain to your <b>Applications</b> folder first, then open it from there and come back here. (Running from a disk image or Downloads would break the tools it installs.)
          </div>
        )}
        {state.bootstrap_ok === false && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            Last setup{state.bootstrap_at ? ` (${new Date(state.bootstrap_at).toLocaleString()})` : ""} didn&apos;t finish: {state.bootstrap_failed.map((f) => STEP_LABEL[f] ?? f).join(", ")} failed. Fix the cause and run it again — the token is kept.
          </div>
        )}
        {!state.node_ok && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
            Bundled Node isn&apos;t runnable ({state.node}). This build may be incomplete — re-download the latest release, or tell your team admin.
          </div>
        )}
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-slate-700">Name for this Mac (shows on the team board)</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} disabled={busy}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" checked={syncReminders} onChange={(e) => setSyncReminders(e.target.checked)} disabled={busy} />
          Sync the team&apos;s shared Apple Reminders lists from this Mac
        </label>
        {syncReminders && !canAdmin && (
          <div className="ml-5 text-[11px] text-slate-500">
            Which lists feed which repos is set by a team admin on Settings → Reminders; this Mac syncs whatever they map.
          </div>
        )}
        {syncReminders && canAdmin && (
          <div className="ml-5 grid grid-cols-2 gap-2">
            <div className="col-span-2 text-[11px] text-slate-500">
              Which lists feed which repos is set once for the whole team on Settings → Reminders. Optionally map the first one here:
            </div>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Reminders list (optional)</span>
              <input value={list} onChange={(e) => { setList(e.target.value); setRepo(guessRepo(e.target.value)); }} disabled={busy}
                className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none" />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Repo it feeds</span>
              <select value={repo} onChange={(e) => setRepo(e.target.value)} disabled={busy}
                className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-brand-500 focus:outline-none">
                {repos.length === 0 && <option value="">(no linked repos)</option>}
                {repos.map((r) => <option key={r.id} value={r.full_name}>{r.full_name}</option>)}
              </select>
            </label>
          </div>
        )}
        <button onClick={() => void run()} disabled={busy || done === "ok" || !state.in_applications}
          className="w-full rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50">
          {busy ? "Setting up…" : done === "ok" ? "All set" : done === "fail" ? "Retry setup" : state.bootstrap_ok === false ? "Run setup again" : "Set up this Mac"}
        </button>
        {result && <StepList result={result} />}
        {lines.length > 0 && (
          <pre className="max-h-48 overflow-auto rounded-md bg-slate-900 p-2.5 text-[10px] leading-relaxed text-slate-100">{lines.join("\n")}</pre>
        )}
        {done === "ok" && (
          <button onClick={onDone} className="w-full rounded-md border border-brand-300 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
            Open DevBrain
          </button>
        )}
        {done === "fail" && !result?.fatal && (
          <button onClick={() => { try { sessionStorage.setItem("devbrain_skip_setup", "1"); } catch { /* private mode */ } onDone(); }}
            className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
            Continue to DevBrain anyway (you can re-run setup from Settings)
          </button>
        )}
      </div>
    </div>
  );
}

// Settings → "Setup on this Mac": last outcome + re-run without re-minting.
function SetupCard({ state, inline }: { state: SetupState; inline?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const rerun = async () => {
    setBusy(true); setErr(null); setResult(null);
    try { setResult(await rerunBootstrap()); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const status = result ? (result.ok ? "ok" : "failed") : state.bootstrap_ok === false ? "failed" : state.bootstrap_ok ? "ok" : null;
  if (inline) {
    return (
      <span className="text-right">
        <button onClick={() => void rerun()} disabled={busy} className="font-display text-[11px] font-semibold text-brand-400 hover:underline disabled:opacity-50">{busy ? "Running…" : "Re-run"}</button>
        {err && <span className="block text-[10px] text-stop">✗ {err}</span>}
        {result && <span className={"block font-mono text-[10px] " + (result.ok ? "text-go" : "text-stop")}>{result.ok ? "all parts ok" : `failed: ${result.failed.join(", ")}`}</span>}
      </span>
    );
  }
  return (
    <div className="card px-2.5 py-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Setup on this Mac</span>
        <span className={"chip " + (status === "failed" ? "bg-red-50 text-red-700" : status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
          {status === "failed" ? "needs attention" : status === "ok" ? "complete" : "unknown"}
        </span>
      </div>
      <p className="text-[11px] text-slate-500">
        {state.bootstrap_at ? `Last run ${new Date(state.bootstrap_at).toLocaleString()}.` : "Never run."}{" "}
        {state.bootstrap_ok === false && !result ? `Failed: ${state.bootstrap_failed.map((f) => STEP_LABEL[f] ?? f).join(", ")}.` : ""}{" "}
        Re-running is safe: it keeps your token and only fixes what's missing.
      </p>
      <button onClick={() => void rerun()} disabled={busy}
        className="mt-1.5 rounded-md border border-slate-300 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        {busy ? "Running…" : "Re-run setup"}
      </button>
      {err && <p className="mt-1.5 text-[11px] text-red-700">✗ {err}</p>}
      {result && <div className="mt-2"><StepList result={result} />{result.fatal && <pre className="mt-1 max-h-32 overflow-auto rounded-md bg-slate-900 p-2 text-[10px] text-slate-100">{result.log}</pre>}</div>}
    </div>
  );
}

// Tab icons — hand-drawn stroke glyphs so the widget stays dependency-free.
// 22px box, 1.75 stroke; the active state is expressed by colour from the
// parent, plus a filled accent on a couple of glyphs where it reads better.
function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (tab) {
    case "Home":
      return (
        <svg {...common}>
          <path d="M3.5 11.2 12 4l8.5 7.2" />
          <path d="M6 10v9.5h4.5v-5h3v5H18V10" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
        </svg>
      );
    case "Tasks":
      // Reminders-style: bullet dots with lines beside them.
      return (
        <svg {...common}>
          <circle cx="6" cy="7" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="6" cy="17" r="1.6" fill="currentColor" stroke="none" />
          <path d="M10.5 7h8.5M10.5 12h8.5M10.5 17h8.5" />
        </svg>
      );
    case "PRs":
      // Git pull-request glyph: a branch from one commit merging into another.
      return (
        <svg {...common}>
          <circle cx="6.5" cy="5.5" r="2.2" />
          <circle cx="6.5" cy="18.5" r="2.2" />
          <circle cx="17.5" cy="18.5" r="2.2" />
          <path d="M6.5 7.7v8.6" />
          <path d="M11.5 5.5h3.5a2.5 2.5 0 0 1 2.5 2.5v8.3" />
          <path d="M13.8 3.2 11.5 5.5l2.3 2.3" />
        </svg>
      );
    case "Brain":
      return (
        <svg {...common}>
          <path d="M9.5 4.5a2.6 2.6 0 0 0-2.6 2.2A2.7 2.7 0 0 0 5 9.4a2.7 2.7 0 0 0 .5 4.3A2.7 2.7 0 0 0 7.2 17.6 2.5 2.5 0 0 0 12 18V6.8a2.5 2.5 0 0 0-2.5-2.3Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
          <path d="M14.5 4.5a2.6 2.6 0 0 1 2.6 2.2A2.7 2.7 0 0 1 19 9.4a2.7 2.7 0 0 1-.5 4.3 2.7 2.7 0 0 1-1.7 3.9A2.5 2.5 0 0 1 12 18V6.8a2.5 2.5 0 0 1 2.5-2.3Z" fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.15 : 0} />
          <path d="M12 9.5h-1.5M12 13h2M9 8.2c-.8.3-1.2 1-1.2 1.8M15 13.8c.8.3 1.2 1 1.2 1.8" />
        </svg>
      );
    case "Feed":
      // Live pulse: the feed is what just happened across the team.
      return (
        <svg {...common}>
          <path d="M3 12h3.2l2.3-6 3.4 12 2.6-8.5 1.7 2.5H21" />
        </svg>
      );
  }
}

function Switch({ on, small }: { on: boolean; small?: boolean }) {
  const h = small ? "h-5 w-9" : "h-6 w-11";
  const knob = small ? "h-3.5 w-3.5" : "h-4 w-4";
  const shift = small ? (on ? "translate-x-5" : "translate-x-1") : on ? "translate-x-6" : "translate-x-1";
  return (
    <span
      className={`relative inline-flex ${h} flex-shrink-0 items-center rounded-full transition-colors ` + (on ? "bg-brand-600" : "bg-slate-200")}
    >
      <span className={`inline-block ${knob} transform rounded-full bg-white shadow transition-transform ` + shift} />
    </span>
  );
}

type BoolPref = Exclude<keyof NotifPrefs, "scope">;

const NOTIF_ROWS: { key: BoolPref; label: string; detail: string }[] = [
  { key: "broadcasts", label: "Broadcasts", detail: "A teammate sends a team-wide heads-up" },
  { key: "pr_conflicts", label: "PR conflicts", detail: "An open pull request develops merge conflicts" },
  { key: "pr_approvals", label: "PR approvals", detail: "A pull request gets approved" },
  { key: "p1_tasks", label: "Critical tasks", detail: "Someone files a new P1 task" },
  { key: "handoffs", label: "Handoffs", detail: "A teammate leaves unfinished work for pickup" },
  { key: "task_autocomplete", label: "Auto-completed tasks", detail: "A merge closed a task on the board automatically" },
  { key: "merge_lights", label: "Merge lights", detail: "Your PR is cleared to land, or was auto-merged" },
  { key: "specs", label: "Context docs", detail: "A dropped spec finished analyzing and is ready to review" },
];

export function WidgetApp({ data }: { data: WidgetData }) {
  const [tab, setTab] = useState<View>("Home");
  // First-run: inside the desktop app with no ~/.devbrain/config.json yet.
  const [setup, setSetup] = useState<SetupState | null>(null);
  useEffect(() => {
    const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
    if (!core) return;
    core.invoke("setup_state").then((s) => setSetup(s as SetupState)).catch(() => {});
  }, []);
  // Self-update: a new deployment changes `data.deploy` on the next refresh;
  // reload so the bundle (icons, components, styles) matches the server.
  const bootDeploy = useRef(data.deploy);
  useEffect(() => {
    if (data.deploy && bootDeploy.current && data.deploy !== bootDeploy.current) {
      window.location.reload();
    }
  }, [data.deploy]);
  const [switching, startSwitch] = useTransition();
  const [capture, setCapture] = useState<null | "task" | "dump" | "spec">(null);
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCapture(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  const [testResult, setTestResult] = useState<DeliveryResult | "sending" | null>(null);
  const runTest = async () => {
    setTestResult("sending");
    setTestResult(await testNotification());
  };
  useEffect(() => setPrefs(readPrefs()), []); // localStorage only exists client-side
  const setPref = (key: BoolPref, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    writePrefs(next);
    if (key === "enabled" && value) void testNotification(); // proves permission + delivery immediately
  };
  const open = data.tasks.filter((t) => t.status === "open");
  const done = data.tasks.filter((t) => t.status === "done").slice(0, 5);

  if (setup && !setup.configured) {
    let skipped = false;
    try { skipped = sessionStorage.getItem("devbrain_skip_setup") === "1"; } catch { /* private mode */ }
    if (!skipped) return <SetupScreen state={setup} repos={data.repos} canAdmin={data.canAdmin} onDone={() => window.location.reload()} />;
  }

  const initials = (name: string) => name.split(/[\s'’-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
  const isMe = (name: string | null | undefined) => Boolean(data.self && name && name.toLowerCase() === data.self.toLowerCase());
  const hourAgo = Date.now() - 3600_000;
  const peopleLastHour = new Set(data.activity.filter((a) => new Date(a.at).getTime() > hourAgo).map((a) => a.dev_label ?? "")).size;
  return (
    <div className="flex h-screen flex-col bg-ink text-txt">
      <WidgetBadge
        input={{
          self: data.self,
          prs: data.prs.map((p) => ({ author: p.author, number: p.number, mergeable_state: p.mergeable_state, light: p.light })),
          tasks: data.tasks.map((t) => ({ priority: t.priority, status: t.status, assigned_to: t.assigned_to })),
          claims: data.claims.map((c) => ({ dev_label: c.dev_label, paths: c.paths })),
          collisions: data.collisions.map((c) => ({ file: c.file, branches: c.branches })),
          handoffs: data.handoffs.map((h) => ({ id: h.id, by: h.by })),
        }}
      />
      <WidgetNotifier
        self={data.self}
        activeRepoId={data.scopeAll ? null : (data.lastRepo?.id ?? null)}
        prSeeds={data.prs.map((p) => ({
          repo_id: p.repo_id,
          number: p.number,
          mergeable_state: p.mergeable_state,
          review_state: p.review_state,
        }))}
      />
      {/* Header — wordmark, live dot, scope, gear. No border: the pulse strip
          below it is the divider. */}
      <div className="flex flex-shrink-0 items-center justify-between px-3.5 pb-1 pt-3">
        <span className="flex items-center gap-2">
          <BrainMark size={20} id="wg" className="flex-shrink-0 drop-shadow-[0_0_6px_rgba(232,128,120,0.35)]" />
          <span className="font-display text-[15px] font-semibold tracking-tight text-txt">DevBrain</span>
          <WidgetLive />
        </span>
        <span className="flex items-center gap-1.5">
          {data.repos.length > 0 && (
            <select
              value={data.scopeAll ? "all" : (data.lastRepo?.id ?? "all")}
              disabled={switching}
              onChange={(e) => {
                const id = e.target.value;
                if (id) startSwitch(() => setWidgetRepo(id));
              }}
              title="Scope — filters everything in the widget to one repo"
              className={
                "max-w-[150px] truncate rounded-md border border-line2 bg-row2 px-2 py-1 font-mono text-[11px] text-txt focus:border-brand-500 focus:outline-none " +
                (switching ? "opacity-50" : "")
              }
            >
              <option value="all">All repos</option>
              {data.repos.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <button
            onClick={() => setTab(tab === "Settings" ? "Home" : "Settings")}
            aria-label="Settings"
            title="Settings"
            className={
              "rounded-md p-1.5 " +
              (tab === "Settings" ? "bg-brand-50 text-brand-400" : "text-muted hover:bg-row2 hover:text-txt")
            }
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </span>
      </div>

      <Pulse
        activity={data.activity}
        events={[...data.feed.map((f) => ({ at: f.at, kind: f.kind })), ...data.handoffs.map((h) => ({ at: h.at, kind: "handoff" }))]}
        collision={data.collisions.length > 0}
        people={peopleLastHour}
        prEvents={data.prs.length}
      />

      {/* Content */}
      <div className={"min-h-0 flex-1 " + (tab === "Home" ? "overflow-y-auto" : "overflow-y-auto px-3 py-2.5")}>
        {tab === "Settings" && (
          <div className="-mx-3 -my-2.5 flex h-full flex-col">
            <div className="mx-3.5 mb-1 flex h-8 flex-shrink-0 items-center border-b border-line font-mono text-[10px] tracking-wider text-muted">
              SETTINGS · <span className="text-brand-400">&nbsp;this Mac</span>&nbsp;· notifications {prefs.enabled ? "on" : "off"}{setup?.reminders_on ? " · reminders on" : ""}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-3">
              <section className="mt-2">
                <h2 className="wg-sec">Notifications <span className="n">{prefs.enabled ? "on" : "off"}</span>
                  <span className="ml-auto inline-flex items-center gap-2">
                    <span className="inline-flex rounded-md border border-line2 bg-ink p-0.5">
                      {([{ key: "all", label: "All repos" }, { key: "repo", label: "This repo" }] as const).map((o) => (
                        <button key={o.key} onClick={() => { const next = { ...prefs, scope: o.key }; setPrefs(next); writePrefs(next); }} className={"rounded px-2 py-0.5 font-display text-[10.5px] font-semibold normal-case tracking-normal " + (prefs.scope === o.key ? "bg-row2 text-txt" : "text-muted")}>{o.label}</button>
                      ))}
                    </span>
                    <button onClick={() => setPref("enabled", !prefs.enabled)} aria-label="Toggle notifications"><Switch on={prefs.enabled} small /></button>
                  </span>
                </h2>
                {prefs.scope === "repo" && data.scopeAll && <p className="wg-empty text-wait">No repo selected in the header — nothing will notify until you pick one.</p>}
                <div className={prefs.enabled ? "" : "pointer-events-none opacity-40"}>
                  {NOTIF_ROWS.map((r) => (
                    <div key={r.key} className="wg-row">
                      <div className="k"><div className="t">{r.label}</div><div className="s">{r.detail}</div></div>
                      <button onClick={() => setPref(r.key, !prefs[r.key])} aria-label={`Toggle ${r.label}`}><Switch on={prefs[r.key]} small /></button>
                    </div>
                  ))}
                </div>
                <div className="wg-empty">
                  <button onClick={() => void runTest()} className="font-display text-[11.5px] font-semibold text-brand-400 hover:underline">Send a test notification →</button>
                  {testResult && (
                    <span className="ml-2 text-[11px]">
                      {testResult === "sending" ? <span className="text-faint">Sending…</span>
                        : testResult.ok ? <span className="text-go">Delivered via {testResult.via}.{testResult.native_error && <span className="block text-wait">native path skipped: {testResult.native_error}</span>}</span>
                        : testResult.reason === "denied" ? <span className="text-wait">Turned off for DevBrain in macOS. <button onClick={openNotificationSettings} className="underline">Open System Settings → Notifications</button></span>
                        : testResult.reason === "unsupported" ? <span className="text-muted">No notification channel here — use the desktop app.</span>
                        : <span className="text-stop">Couldn&apos;t deliver: {testResult.detail || "unknown error"}</span>}
                    </span>
                  )}
                </div>
              </section>

              {setup && (
                <section className="mt-2.5">
                  <h2 className="wg-sec">This Mac <span className="n">{setup.app_version ? `v${setup.app_version}` : ""}</span><span className={"r " + (setup.bootstrap_ok === false ? "text-stop" : setup.bootstrap_ok ? "text-go" : "")}>{setup.bootstrap_ok === false ? "needs attention" : setup.bootstrap_ok ? "complete" : ""}</span></h2>
                  <div className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1.5 px-3.5 py-1 text-[12px]">
                    <span className="text-muted">Setup</span><span className="font-mono text-[11px] text-txt">{setup.bootstrap_at ? `ran ${new Date(setup.bootstrap_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : "never run"}{setup.bootstrap_failed.length ? ` · failed: ${setup.bootstrap_failed.join(", ")}` : setup.bootstrap_ok ? " · all parts ok" : ""}</span><SetupCard state={setup} inline />
                    <span className="text-muted">Reminders</span><span className="font-mono text-[11px] text-txt">{setup.reminders_on ? "sync on · mapped lists sync every 3 min" : "sync off"}</span><a href="/settings/reminders" target="_blank" className="font-display text-[11px] font-semibold text-brand-400">Map lists</a>
                    <span className="text-muted">Updates</span><span className="font-mono text-[11px] text-txt">daily + on session start</span><span />
                  </div>
                </section>
              )}

              {data.lastRepo && data.rules.length > 0 && (
                <section className="mt-2.5">
                  <h2 className="wg-sec">Team rules <span className="n">{data.lastRepo.name}</span><span className="r">{data.canAdmin ? "" : "admins change these"}</span></h2>
                  {data.rules.map((r) => (
                    <div key={r.rule} className="wg-row">
                      <div className="k"><div className="t">{r.label}</div></div>
                      {data.canAdmin ? (
                        <form action={toggleRule} className="flex-shrink-0">
                          <input type="hidden" name="repoId" value={data.lastRepo!.id} />
                          <input type="hidden" name="rule" value={r.rule} />
                          <input type="hidden" name="enabled" value={String(!r.on)} />
                          <input type="hidden" name="stay" value="1" />
                          <button aria-label={r.on ? "Turn off" : "Turn on"}><Switch on={r.on} small /></button>
                        </form>
                      ) : (
                        <span className="flex-shrink-0 opacity-50" title="Admins only"><Switch on={r.on} small /></span>
                      )}
                    </div>
                  ))}
                  <p className="wg-empty">Rules apply to every Claude working in this repo. Full details on the dashboard Rules tab.</p>
                </section>
              )}

              {data.lastRepo && (
                <section className="mt-2.5">
                  <h2 className="wg-sec">Claim a lane <span className="n">{data.lastRepo.name}</span></h2>
                  <p className="wg-empty">Working outside Claude Code? Claim your paths — teammates&apos; Claudes route around them.</p>
                  <form action={createClaim} className="flex flex-col gap-1.5 px-3.5 pb-1">
                    <input type="hidden" name="repoId" value={data.lastRepo.id} />
                    <input name="paths" required placeholder="Paths, comma-separated (e.g. src/auth/)" className="w-full rounded-md border border-line2 bg-ink px-2.5 py-1.5 text-xs text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                    <div className="flex gap-1.5">
                      <input name="note" placeholder="What you're doing" className="min-w-0 flex-1 rounded-md border border-line2 bg-ink px-2.5 py-1.5 text-xs text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      <select name="hours" defaultValue="4" className="rounded-md border border-line2 bg-ink px-1.5 py-1.5 font-mono text-[11px] text-txt"><option value="1">1h</option><option value="2">2h</option><option value="4">4h</option><option value="8">8h</option></select>
                      <button className="rounded-md bg-brand-600 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-brand-700">Claim</button>
                    </div>
                  </form>
                </section>
              )}

              <p className="wg-empty mt-3"><a href={data.lastRepo ? `/dashboard/${data.lastRepo.id}` : "/dashboard"} target="_blank" className="font-display text-[11.5px] font-semibold text-brand-400 hover:underline">Open full dashboard →</a> <span className="text-faint">History, Rules, repo management.</span></p>
            </div>
          </div>
        )}

        {tab === "Home" && (
          <div className="flex flex-col pb-2">
            {data.notice && (
              <div className="mx-3.5 mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800">
                {data.notice === "owner_only" ? "Only the team owner can do that." : "Only team admins and owners can do that."}
              </div>
            )}
            {(data.alerts ?? []).length > 0 && (
              <div className="mx-3.5 mt-2 space-y-1">
                {data.alerts.map((a) => (
                  <div key={a.id} className={"flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[11px] " + (a.severity === "error" ? "border-red-200 bg-red-50 text-red-800" : a.severity === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-line bg-row text-txt")}>
                    <span className="min-w-0 flex-1 truncate font-medium">{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</span>
                    <form action={dismissAlert}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="stay" value="1" />
                      <button className="opacity-70 hover:opacity-100">dismiss</button>
                    </form>
                  </div>
                ))}
              </div>
            )}

            {data.collisions.length > 0 && (
              <section className="mt-2.5">
                <h2 className="wg-sec">Collision <span className="n">{data.collisions.length}</span><span className="r">{data.collisions[0].branches.length} branches</span></h2>
                {data.collisions.slice(0, 3).map((c) => (
                  <div key={c.repo + c.file} className="wg-row stop">
                    <div className="k"><div className="t"><span className="wg-mono">{c.file}</span></div><div className="s">{c.branches.join(" + ")}{data.scopeAll ? ` · ${c.repo}` : ""}</div></div>
                    <span className="wg-pill stop">contested</span>
                  </div>
                ))}
              </section>
            )}

            <section className="mt-2.5">
              <h2 className="wg-sec">Now working <span className="n">{data.sessions.length}</span></h2>
              {data.sessions.length === 0 ? (
                <p className="wg-empty">Nobody active right now.</p>
              ) : (
                data.sessions.slice(0, 5).map((s) => (
                  <div key={s.id} className={"wg-row " + (isMe(s.dev_label) ? "me" : "")}>
                    <span className={"wg-av " + (isMe(s.dev_label) ? "me" : "")}>{initials(s.dev_label)}</span>
                    <div className="k">
                      <div className="t">{s.dev_label}{data.scopeAll ? <span className="wg-mono"> · {s.repo}</span> : null}</div>
                      <div className="s">{s.summary || "working"}</div>
                    </div>
                    <span className="m">{isMe(s.dev_label) ? "you" : timeAgo(s.last_seen)}</span>
                  </div>
                ))
              )}
            </section>

            {data.prs.length > 0 && (
              <section className="mt-2.5">
                <h2 className="wg-sec">Pull requests <span className="n">{data.prs.length}</span>{data.conflicted > 0 && <span className="r text-stop">{data.conflicted} conflicted</span>}</h2>
                {data.prs.slice(0, 4).map((pr) => {
                  const st = pr.mergeable_state === "dirty" ? "stop" : pr.light?.state === "green" ? "go" : pr.light?.state === "amber" || pr.light?.state === "red" ? "wait" : "";
                  return (
                    <a key={pr.repo_id + pr.number} href={pr.html_url ?? "#"} target="_blank" className={"wg-row " + st}>
                      <div className="k">
                        <div className="t"><span className="wg-mono">#{pr.number}</span> {pr.title}</div>
                        <div className="s">{pr.author}{pr.review_state ? ` · ${pr.review_state.replace("_", " ")}` : ""}{pr.light?.reason ? ` · ${pr.light.reason}` : ""}</div>
                      </div>
                      {st && <span className={"wg-pill " + st}>{st === "go" ? "cleared" : st === "stop" ? "conflicts" : "waiting"}</span>}
                    </a>
                  );
                })}
                {data.prs.length > 4 && <button onClick={() => setTab("PRs")} className="wg-empty text-left text-brand-400">all {data.prs.length} →</button>}
              </section>
            )}

            {data.handoffs.length > 0 && (
              <section className="mt-2.5">
                <h2 className="wg-sec">Handoff <span className="n">{data.handoffs.length}</span></h2>
                {data.handoffs.slice(0, 2).map((h) => (
                  <div key={h.id} className="wg-row wait">
                    <span className="wg-av">{initials(h.by ?? "?")}</span>
                    <div className="k">
                      <div className="t">{h.by} left work{h.branch ? <span className="wg-mono"> on {h.branch}</span> : null}</div>
                      <div className="s">{h.summary}{h.remaining ? ` — ${h.remaining}` : ""}</div>
                    </div>
                    <span className="m">{timeAgo(h.at)}</span>
                  </div>
                ))}
              </section>
            )}

            <section className="mt-2.5">
              <h2 className="wg-sec">Claimed lanes <span className="n">{data.claims.length}</span></h2>
              {data.claims.length === 0 && <p className="wg-empty">None. Start a task, or claim an area in Settings.</p>}
              {data.claims.slice(0, 3).map((c) => (
                <div key={c.id} className={"wg-row " + (isMe(c.dev_label) ? "me" : "")}>
                  <span className={"wg-av " + (isMe(c.dev_label) ? "me" : "")}>{initials(c.dev_label)}</span>
                  <div className="k">
                    <div className="t">{c.dev_label}{c.note ? <span className="font-normal text-muted"> — {c.note}</span> : null}</div>
                    <div className="s">{c.paths.slice(0, 3).map((p) => <span key={p} className="wg-mono mr-1.5">{p}</span>)}</div>
                  </div>
                  {c.expires_at && <span className="m">{Math.max(1, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 3600_000))}h</span>}
                  <form action={releaseClaim} className="flex-shrink-0">
                    <input type="hidden" name="repoId" value={c.repo_id} />
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-[10px] text-faint hover:text-brand-400">release</button>
                  </form>
                </div>
              ))}
            </section>

            <section className="mt-2.5">
              <h2 className="wg-sec">Top tasks <span className="n">{open.length} open</span><button onClick={() => setTab("Tasks")} className="r hover:text-brand-400">all →</button></h2>
              {open.length === 0 ? (
                <p className="wg-empty">Nothing open. Nice.</p>
              ) : (
                open.slice(0, 6).map((t) => (
                  <div key={t.id} className={"wg-row " + (t.priority === 1 ? "stop" : isMe(t.assigned_to) ? "me" : "")}>
                    <form action={completeTask} className="flex-shrink-0">
                      <input type="hidden" name="repoId" value={t.repo_id} />
                      <input type="hidden" name="id" value={t.id} />
                      <button title="Mark complete" className="block h-3.5 w-3.5 rounded border border-line2 hover:border-brand-500" />
                    </form>
                    <span className={"font-mono text-[10px] " + (t.priority === 1 ? "text-stop" : t.priority === 2 ? "text-wait" : "text-faint")}>P{t.priority}</span>
                    <div className="k">
                      <div className="t">{t.title}</div>
                      <div className="s">{t.assigned_to ? (isMe(t.assigned_to) ? "assigned to you" : t.assigned_to) : "unassigned"}{t.started_by ? ` · started by ${t.started_by}` : ""}{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}</div>
                    </div>
                    <span className="m">{timeAgo(t.created_at)}</span>
                  </div>
                ))
              )}
            </section>

            {data.feed.length > 0 && (
              <section className="mt-2.5">
                <h2 className="wg-sec">Decided <span className="n">{data.feed.filter((f) => f.kind === "decision").length}</span><button onClick={() => setTab("Feed")} className="r hover:text-brand-400">feed →</button></h2>
                {data.feed.slice(0, 2).map((d, i) => (
                  <p key={i} className="wg-empty"><span className="text-muted">{d.text}</span> <span className="font-mono text-[10px]">— {d.by ?? "?"}, {timeAgo(d.at)}</span></p>
                ))}
              </section>
            )}
          </div>
        )}

        {tab === "Tasks" && (() => {
          const mine = open.filter((t) => isMe(t.started_by) || isMe(t.assigned_to));
          const now = open.filter((t) => isMe(t.started_by)).sort((a, b) => a.priority - b.priority);
          const focus = now[0] ?? null;
          const queue = open.filter((t) => isMe(t.assigned_to) && !isMe(t.started_by)).sort((a, b) => a.priority - b.priority);
          const team = open.filter((t) => !isMe(t.assigned_to) && !isMe(t.started_by));
          const maybe = open.filter((t) => t.maybe_done_pr);
          const counts = new Map<string, number>();
          for (const t of team) counts.set(t.assigned_to ?? "", (counts.get(t.assigned_to ?? "") ?? 0) + 1);
          const people = [...counts.entries()].sort((a, b) => b[1] - a[1]);
          const teamShown = teamFilter === null ? team : team.filter((t) => (t.assigned_to ?? "") === teamFilter);
          const lane = focus ? data.claims.find((c) => isMe(c.dev_label) && c.repo_id === focus.repo_id) : null;
          const hoursLeft = (iso: string | null) => (iso ? Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 3600_000)) : null);
          const age = (t: { created_at: string }) => timeAgo(t.created_at);
          const P = (p: number) => <span className={"font-mono text-[10px] " + (p === 1 ? "text-stop" : p === 2 ? "text-wait" : p === 3 ? "text-muted" : "text-faint")}>P{p}</span>;
          const Row = ({ t, action }: { t: (typeof open)[number]; action?: React.ReactNode }) => (
            <div className={"wg-row " + (t.priority === 1 ? "stop" : isMe(t.assigned_to) || isMe(t.started_by) ? "me" : "")}>
              <form action={completeTask} className="flex-shrink-0">
                <input type="hidden" name="repoId" value={t.repo_id} />
                <input type="hidden" name="id" value={t.id} />
                <button title="Mark complete" className="block h-3.5 w-3.5 rounded border border-line2 hover:border-brand-500" />
              </form>
              <div className="k">
                <div className="t">{t.title}</div>
                <div className="s">{t.assigned_to ? (isMe(t.assigned_to) ? "you" : t.assigned_to) : "unassigned"}{t.started_by ? ` · started by ${isMe(t.started_by) ? "you" : t.started_by}` : ""}{t.tags.length ? ` · ${t.tags.join(", ")}` : ""}{data.scopeAll ? ` · ${t.repo}` : ""}</div>
              </div>
              {P(t.priority)}
              <span className="m">{age(t)}</span>
              {action}
              <TaskMenu compact task={{ id: t.id, repo_id: t.repo_id, title: t.title, detail: t.detail, priority: t.priority, tags: t.tags, assigned_to: t.assigned_to }} members={data.members} />
            </div>
          );
          return (
          <div className="relative -mx-3 -my-2.5 flex h-full flex-col">
            {/* Strip: counts + the capture trigger */}
            <div className="mx-3.5 mb-1.5 flex h-8 flex-shrink-0 items-center border-b border-line font-mono text-[10px] tracking-wider text-muted">
              YOUR WORK · <span className="text-brand-400">&nbsp;{now.length} in progress</span>&nbsp;· {queue.length} queued · team {team.length} open
              <button
                onClick={() => setCapture((c) => (c ? null : "task"))}
                className={"ml-auto inline-flex h-6 items-center gap-1 rounded-md border px-2 font-display text-[11px] font-semibold tracking-normal " + (capture ? "border-[#5a2e31] bg-brand-50 text-brand-400" : "border-line2 bg-row2 text-txt hover:border-brand-500")}
              >
                <span className="text-[14px] leading-none text-brand-400">＋</span>New
              </button>
            </div>

            {capture && data.lastRepo && (
              <>
                <div className="absolute inset-0 z-[4] bg-ink/60" onClick={() => setCapture(null)} />
                <div className="absolute left-2.5 right-2.5 top-10 z-[5] overflow-hidden rounded-xl border border-line2 bg-row shadow-[0_24px_48px_rgba(0,0,0,.5)]">
                  <div className="flex items-center gap-0.5 border-b border-line px-2 pt-2">
                    {([["task", "Task"], ["dump", "Braindump"], ["spec", "Context doc"]] as const).map(([k, label]) => (
                      <button key={k} onClick={() => setCapture(k)} className={"-mb-px border-b-2 px-2.5 pb-2 pt-1.5 font-display text-[11.5px] font-semibold " + (capture === k ? "border-brand-500 text-txt" : "border-transparent text-muted hover:text-txt")}>{label}</button>
                    ))}
                    <span className="ml-auto flex items-center gap-1.5 pb-2 font-mono text-[10px] text-faint"><i className="inline-block h-1.5 w-1.5 rounded-full bg-go" />{data.lastRepo.name}</span>
                  </div>
                  {capture === "task" && (
                    <form action={createTask} className="flex flex-col gap-2 px-3 pb-3 pt-2.5">
                      <input type="hidden" name="repoId" value={data.lastRepo.id} />
                      <input name="title" required autoFocus placeholder="What needs doing?" className="w-full rounded-md border border-line2 bg-ink px-2.5 py-2 text-[13.5px] text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      <div className="flex gap-1.5">
                        <select name="priority" defaultValue="3" className="rounded-md border border-line2 bg-ink px-1.5 py-1.5 font-mono text-[11.5px] text-txt">
                          <option value="1">P1 · Critical</option><option value="2">P2 · High</option><option value="3">P3 · Medium</option><option value="4">P4 · Low</option>
                        </select>
                        <select name="assignee" defaultValue="" className="rounded-md border border-line2 bg-ink px-1.5 py-1.5 font-mono text-[11.5px] text-txt">
                          <option value="">Anyone</option>
                          {data.members.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <input name="detail" placeholder="Detail (optional)" className="min-w-0 flex-1 rounded-md border border-line2 bg-ink px-2 py-1.5 text-xs text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"].map((tag) => (
                          <label key={tag} className="cursor-pointer">
                            <input type="checkbox" name="tags" value={tag} className="peer sr-only" />
                            <span className="rounded-full border border-line2 px-2 py-0.5 font-mono text-[10.5px] text-muted peer-checked:border-brand-500 peer-checked:text-brand-400">{tag}</span>
                          </label>
                        ))}
                        <input name="customTags" placeholder="+custom" className="w-16 rounded-full border border-line2 bg-ink px-2 py-0.5 font-mono text-[10.5px] text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      </div>
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="flex-1 font-mono text-[10px] text-faint">↵ adds · esc closes</span>
                        <button type="button" onClick={() => setCapture(null)} className="rounded-md border border-line2 px-3 py-1.5 font-display text-xs font-semibold text-muted">Cancel</button>
                        <button className="rounded-md bg-brand-600 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-brand-700">Add task</button>
                      </div>
                    </form>
                  )}
                  {capture === "dump" && (
                    <form action={braindumpTasks} className="flex flex-col gap-2 px-3 pb-3 pt-2.5">
                      <input type="hidden" name="repoId" value={data.lastRepo.id} />
                      <textarea name="dump" required autoFocus rows={5} placeholder="Everything on your mind — DevBrain splits it into tasks and skips duplicates." className="w-full resize-none rounded-md border border-line2 bg-ink px-2.5 py-2 text-xs leading-relaxed text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="flex-1 font-mono text-[10px] text-faint">dictate or type · duplicates are skipped</span>
                        <button type="button" onClick={() => setCapture(null)} className="rounded-md border border-line2 px-3 py-1.5 font-display text-xs font-semibold text-muted">Cancel</button>
                        <button className="rounded-md bg-brand-600 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-brand-700">Turn into tasks</button>
                      </div>
                    </form>
                  )}
                  {capture === "spec" && (
                    <form action={uploadSpec} className="flex flex-col gap-2 px-3 pb-3 pt-2.5">
                      <input type="hidden" name="repoId" value={data.lastRepo.id} />
                      <input type="hidden" name="stay" value="1" />
                      <textarea name="text" required autoFocus rows={4} placeholder="Paste a spec, brief, or a whole reply from another Claude session — DevBrain works out what's built and what isn't." className="w-full resize-none rounded-md border border-line2 bg-ink px-2.5 py-2 text-xs leading-relaxed text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      <input name="title" placeholder="Title (optional)" className="w-full rounded-md border border-line2 bg-ink px-2.5 py-1.5 text-xs text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                      <div className="flex items-center gap-1.5 pt-1">
                        <span className="flex-1 font-mono text-[10px] text-faint">analyzed in ~2 min · you get a notification</span>
                        <button type="button" onClick={() => setCapture(null)} className="rounded-md border border-line2 px-3 py-1.5 font-display text-xs font-semibold text-muted">Cancel</button>
                        <button className="rounded-md bg-brand-600 px-3 py-1.5 font-display text-xs font-semibold text-white hover:bg-brand-700">Add context</button>
                      </div>
                    </form>
                  )}
                </div>
              </>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {focus ? (
                <div className="mx-3.5 mt-2 rounded-xl border border-[#5a2e31] bg-gradient-to-b from-[#2a1a1d] to-row px-3.5 py-3">
                  <div className="flex items-baseline gap-2 font-display text-[10px] font-semibold uppercase tracking-[.14em] text-brand-400">Now<span className="ml-auto font-mono text-[11px] font-normal normal-case tracking-normal text-muted">{age(focus)}</span></div>
                  <div className="mt-1.5 font-display text-[17px] font-semibold leading-tight tracking-tight text-txt">{focus.title}</div>
                  <div className="mt-1 text-[11.5px] text-muted">{P(focus.priority)}{focus.tags.length ? ` · ${focus.tags.join(", ")}` : ""}{focus.detail ? ` · ${focus.detail}` : ""}</div>
                  {(focus.footprint ?? []).length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">{(focus.footprint ?? []).slice(0, 4).map((fp) => <code key={fp} className="rounded border border-line2 bg-ink px-1.5 py-px font-mono text-[10px] text-[#b8bfcf]">{fp}</code>)}</div>
                  )}
                  <div className="mt-2 font-mono text-[10.5px] text-go">{lane ? `▸ lane claimed · ${lane.paths[0]}${lane.paths.length > 1 ? ` +${lane.paths.length - 1}` : ""}${hoursLeft(lane.expires_at) ? ` · ${hoursLeft(lane.expires_at)}h left` : ""}` : "▸ no lane claimed"}</div>
                  <div className="mt-2.5 flex gap-1.5">
                    <form action={completeTask}><input type="hidden" name="repoId" value={focus.repo_id} /><input type="hidden" name="id" value={focus.id} /><button className="rounded-md bg-brand-600 px-2.5 py-1.5 font-display text-[11.5px] font-semibold text-white hover:bg-brand-700">Mark done</button></form>
                    <TaskMenu compact task={{ id: focus.id, repo_id: focus.repo_id, title: focus.title, detail: focus.detail, priority: focus.priority, tags: focus.tags, assigned_to: focus.assigned_to }} members={data.members} />
                  </div>
                </div>
              ) : (
                <div className="mx-3.5 mt-2 rounded-xl border border-dashed border-line2 px-3.5 py-3 text-xs text-faint">Nothing in progress. Start one from your queue below — or tell your Claude which task you&apos;re taking and it will start it for you.</div>
              )}
              {now.length > 1 && <p className="wg-empty">+{now.length - 1} more in progress: {now.slice(1).map((t) => t.title).join(" · ")}</p>}

              <section className="mt-2.5">
                <h2 className="wg-sec">Next for you <span className="n">{queue.length}</span></h2>
                {queue.length === 0 ? <p className="wg-empty">Nothing queued for you.</p> : queue.map((t, i) => (
                  <div key={t.id} className="wg-row">
                    <span className="w-3.5 text-right font-mono text-[11px] text-faint">{i + 1}</span>
                    <div className="k"><div className="t">{t.title}</div><div className="s">{t.tags.join(", ")}{data.scopeAll ? ` · ${t.repo}` : ""}</div></div>
                    {P(t.priority)}<span className="m">{age(t)}</span>
                    <form action={startTask}><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /><button className="font-display text-[11px] font-semibold text-brand-400 hover:underline">Start</button></form>
                  </div>
                ))}
              </section>

              <section className="mt-2.5">
                <h2 className="wg-sec">Team <span className="n">{team.length} open</span></h2>
                {people.length > 0 && (
                  <div className="flex gap-1.5 overflow-x-auto px-3.5 pb-1.5">
                    {people.map(([who, n]) => (
                      <button key={who} onClick={() => setTeamFilter(teamFilter === who ? null : who)} className={"flex flex-shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-[11.5px] " + (teamFilter === who ? "border-brand-500 bg-brand-50 text-txt" : "border-line2 text-muted")}>
                        <span className="wg-av" style={{ width: 18, height: 18, fontSize: 9 }}>{who ? initials(who) : "—"}</span>{who || "Unassigned"} <span className={"font-mono text-[11px] " + (teamFilter === who ? "text-brand-400" : "text-faint")}>{n}</span>
                      </button>
                    ))}
                  </div>
                )}
                {teamShown.length === 0 ? <p className="wg-empty">Nothing open for the team.</p> : teamShown.map((t) => <Row key={t.id} t={t} />)}
              </section>

              {maybe.length > 0 && (
                <section className="mt-2.5">
                  <h2 className="wg-sec text-wait">Possibly done <span className="n">{maybe.length}</span></h2>
                  {maybe.map((t) => (
                    <div key={t.id} className="wg-row wait">
                      <div className="k"><div className="t">{t.title}</div><div className="s">closed by PR #{t.maybe_done_pr}?</div></div>
                      <form action={confirmMaybeDone}><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /><button className="font-display text-[11px] font-semibold text-go hover:underline">Yes, done</button></form>
                      <form action={dismissMaybeDone}><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /><button className="text-[11px] text-faint hover:text-txt">Still open</button></form>
                    </div>
                  ))}
                </section>
              )}

              {done.length > 0 && (
                <section className="mt-2.5">
                  <h2 className="wg-sec text-go">Done today <span className="n">{done.length}</span><span className="r">auto-clears at 72h</span></h2>
                  {done.map((t) => (
                    <div key={t.id} className="wg-row opacity-60">
                      <span className="block h-3.5 w-3.5 flex-shrink-0 rounded border border-go bg-go" />
                      <div className="k"><div className="t line-through">{t.title}</div><div className="s">{t.done_by}</div></div>
                      <form action={reopenTask}><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /><button className="text-[11px] text-faint hover:text-brand-400">Reopen</button></form>
                    </div>
                  ))}
                </section>
              )}
              {!data.lastRepo && <p className="wg-empty">Pick a repo in the header to add tasks.</p>}
            </div>
          </div>
          );
        })()}

        {tab === "PRs" && (() => {
          const order = data.mergePlan?.order.map((o) => o.number) ?? [];
          const reason = new Map((data.mergePlan?.order ?? []).map((o) => [o.number, o.reason]));
          const sorted = [...data.prs].sort((x, y) => {
            const ix = order.indexOf(x.number), iy = order.indexOf(y.number);
            if (ix !== -1 || iy !== -1) return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
            return 0;
          });
          const st = (pr: (typeof sorted)[number]) => pr.mergeable_state === "dirty" ? "stop" : pr.light?.state === "green" ? "go" : pr.light?.state === "red" ? "stop" : pr.light?.state === "amber" || pr.review_state === "changes_requested" ? "wait" : "";
          const node = { go: "border-go bg-go", wait: "border-wait", stop: "border-stop bg-stop", "": "border-muted" } as const;
          const why = { go: "text-go", wait: "text-wait", stop: "text-stop", "": "text-faint" } as const;
          return (
          <div className="-mx-3 -my-2.5 flex h-full flex-col">
            <div className="mx-3.5 mb-1 flex h-8 flex-shrink-0 items-center border-b border-line font-mono text-[10px] tracking-wider text-muted">
              PULL REQUESTS · <span className="text-brand-400">&nbsp;{data.prs.length} open</span>{data.conflicted > 0 ? <>&nbsp;· <span className="text-stop">{data.conflicted} conflicted</span></> : null}{data.mergePlan ? " · order below" : ""}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {data.mergePlan && data.mergePlan.order.length > 1 && (
                <div className="mx-3.5 mt-2 flex flex-wrap items-center gap-1.5 font-mono text-[10.5px] text-muted">
                  <span className="text-faint">merge order</span>
                  {data.mergePlan.order.map((o, i) => <span key={o.number} className="flex items-center gap-1.5"><span className="rounded border border-line2 px-1.5 text-txt">#{o.number}</span>{i < data.mergePlan!.order.length - 1 && <span className="text-faint">→</span>}</span>)}
                  {!data.scopeAll ? null : <span className="text-faint">· {data.mergePlan.repo}</span>}
                </div>
              )}
              {sorted.length === 0 ? (
                <p className="wg-empty mt-3">No open pull requests.</p>
              ) : (
                <div className="relative mt-2 ml-7 before:absolute before:bottom-3.5 before:left-[-7px] before:top-3.5 before:w-0.5 before:bg-line2">
                  {sorted.map((pr, i) => {
                    const k = st(pr);
                    return (
                      <div key={pr.repo_id + pr.number} className={"relative py-2 pl-2.5 pr-3.5 text-[12.5px] " + (i > 0 ? "border-t border-line" : "")}>
                        {order.length > 0 && <span className="absolute -left-[30px] top-2 font-display text-[10px] font-semibold text-faint">{order.indexOf(pr.number) === -1 ? "" : order.indexOf(pr.number) + 1}</span>}
                        <span className={"absolute -left-3 top-2.5 h-3 w-3 rounded-full border-2 bg-ink " + node[k]} />
                        <a href={pr.html_url ?? "#"} target="_blank" className="font-medium text-txt hover:text-brand-400"><span className="font-mono text-[11px] text-[#b8bfcf]">#{pr.number}</span> {pr.title}</a>
                        <div className="mt-0.5 text-[11.5px] text-muted">{pr.author}{pr.review_state ? ` · ${pr.review_state.replace("_", " ")}` : " · review pending"}{pr.draft ? " · draft" : ""}{data.scopeAll ? ` · ${pr.repo}` : ""}</div>
                        {(pr.light?.reason || reason.get(pr.number)) && (
                          <div className={"mt-1 font-mono text-[10.5px] " + why[k]}>▸ {pr.light?.reason ?? ""}{pr.light?.reason && reason.get(pr.number) ? " — " : ""}{reason.get(pr.number) ?? ""}</div>
                        )}
                        {pr.ai && (
                          <div className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
                            <span className="wg-pill flex-shrink-0 border-[#3a3352] text-[#b9a8ff]">AI · {pr.ai.verdict.replace("_", " ")}</span>
                            <span className="min-w-0">{pr.ai.summary}</span>
                          </div>
                        )}
                        <div className="mt-1"><PrBadges pr={pr} defaultBranch={pr.defaultBranch} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          );
        })()}

        {tab === "Brain" && (
          data.brain ? (
            <WidgetBrain notes={data.brain.notes} nodes={data.brain.nodes} edges={data.brain.edges} initialSlug="index" repoName={data.brain.repoName} />
          ) : (
            <p className="wg-empty mt-3">Pick a repo in the header — its .brain/ notes show here.</p>
          )
        )}

        {tab === "Feed" && (() => {
          type Ev = { at: string; kind: "decision" | "broadcast" | "journal" | "handoff"; who: string; body: string; chips?: string[] };
          const events: Ev[] = [
            ...data.feed.map((f) => ({ at: f.at, kind: (f.kind === "broadcast" ? "broadcast" : "decision") as Ev["kind"], who: f.by ?? "?", body: f.text })),
            ...(data.journals ?? []).map((j) => ({ at: j.at, kind: "journal" as const, who: `${j.by}${j.branch ? " · " + j.branch : ""}`, body: j.summary, chips: [...j.learned.slice(0, 1).map((l) => `learned: ${l}`), ...j.tried_and_failed.slice(0, 1).map((l) => `didn't work: ${l}`), ...(j.remaining ? [`remaining: ${j.remaining}`] : [])] })),
            ...data.handoffs.map((h) => ({ at: h.at, kind: "handoff" as const, who: h.by ?? "?", body: `left work${h.branch ? " on " + h.branch : ""}: ${h.summary}` })),
          ].sort((x, y) => y.at.localeCompare(x.at));
          const dot = { decision: "bg-brand-500", broadcast: "bg-wait", journal: "bg-[#b9a8ff]", handoff: "bg-wait" } as const;
          const kc = { decision: "text-brand-400", broadcast: "text-wait", journal: "text-[#b9a8ff]", handoff: "text-wait" } as const;
          const hhmm = (iso: string) => { const d = new Date(iso); const now = new Date(); const same = d.toDateString() === now.toDateString(); return same ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false }) : d.toLocaleDateString([], { month: "short", day: "numeric" }); };
          const counts = { decision: 0, broadcast: 0, journal: 0, handoff: 0 };
          for (const e of events) counts[e.kind]++;
          return (
          <div className="-mx-3 -my-2.5 flex h-full flex-col">
            <div className="mx-3.5 mb-1 flex h-8 flex-shrink-0 items-center border-b border-line font-mono text-[10px] tracking-wider text-muted">
              FEED · <span className="text-brand-400">&nbsp;{counts.decision} decisions</span>&nbsp;· {counts.broadcast} broadcasts · {counts.journal} journals
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {data.digest && (
                <details className="mx-3.5 mt-2 rounded-xl border border-line2 bg-row px-3 py-2.5">
                  <summary className="flex cursor-pointer list-none items-baseline gap-2 font-display text-[10px] font-semibold uppercase tracking-[.14em] text-brand-400">Standup · {data.digest.repo}<span className="ml-auto font-mono text-[10px] font-normal normal-case tracking-normal text-faint">{data.digest.day} · tap to expand</span></summary>
                  <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-relaxed text-txt">{data.digest.body}</p>
                </details>
              )}
              {events.length === 0 ? (
                <p className="wg-empty mt-3">Quiet. Claudes post here via broadcast and log_decision; journals arrive as sessions end.</p>
              ) : (
                <div className="mt-2 grid grid-cols-[46px_1fr]">
                  {events.slice(0, 40).map((e, i) => (
                    <React.Fragment key={i}>
                      <div className="relative pr-2.5 pt-2 text-right font-mono text-[10px] text-faint">
                        {hhmm(e.at)}
                        <span className={"absolute -right-1 top-3 h-2 w-2 rounded-full " + dot[e.kind]} />
                      </div>
                      <div className="border-l-2 border-line py-1.5 pl-3 pr-3.5 text-[12.5px] text-txt">
                        <span className={"mr-1.5 font-display text-[10px] font-semibold uppercase tracking-[.1em] " + kc[e.kind]}>{e.kind}</span>
                        <span className="font-mono text-[11px] text-muted">{e.who}</span>
                        <div className="mt-0.5">{e.body}</div>
                        {e.chips && e.chips.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.chips.map((c, j) => <span key={j} className="rounded bg-row2 px-1.5 py-px font-mono text-[10px] text-[#b8bfcf]">{c}</span>)}</div>}
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
              {data.activity.length > 0 && (
                <section className="mt-3">
                  <h2 className="wg-sec">Recent work <span className="n">24h</span></h2>
                  <div className="px-3.5"><ActivityFeed rows={data.activity} limit={8} /></div>
                </section>
              )}
            </div>
          </div>
        );
        })()}
      </div>

      {/* Bottom tab bar — icon + label; the active tab takes the accent and a
          short underline. */}
      <div className="flex flex-shrink-0 items-stretch gap-0.5 border-t border-line bg-ink px-2.5 pb-2 pt-1.5">
        {TABS.map((t) => {
          const active = tab === t;
          const attention = t === "Tasks" ? open.some((x) => x.priority === 1 && isMe(x.assigned_to)) : t === "PRs" ? data.conflicted > 0 : false;
          return (
            <button key={t} onClick={() => setTab(t)} aria-label={t} aria-current={active ? "page" : undefined} className={"wg-tab relative " + (active ? "on" : "")}>
              <TabIcon tab={t} active={active} />
              <span>{t}</span>
              {attention && !active && <i className="absolute right-3 top-1.5 h-1.5 w-1.5 rounded-full bg-wait" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
