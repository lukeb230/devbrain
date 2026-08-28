"use client";

// The widget mini-app: a Home tab that fits the panel with NO scrolling
// (tasks + who's working — the glance content), and a bottom tab bar for
// Tasks / PRs / Brain / Feed. Tab switches are instant (pure client state).

import { useEffect, useRef, useState, useTransition } from "react";
import { mintDeviceToken, setWidgetRepo } from "./actions";
import { dismissAlert } from "../settings/org/alert-actions";
import { ActivityFeed, type ActivityRow } from "@/components/ActivityFeed";
import { TaskBody } from "@/components/TaskBody";
import { BrainMark } from "@/components/BrainMark";
import { Pulse } from "./pulse";
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
function SetupCard({ state }: { state: SetupState }) {
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
  const [capture, setCapture] = useState<"dump" | "spec">("dump");
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
          <div className="space-y-2.5">
            {setup && <SetupCard state={setup} />}
            <div className="card px-2.5 py-2">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Notifications</span>
                <button onClick={() => setPref("enabled", !prefs.enabled)} aria-label="Toggle notifications">
                  <Switch on={prefs.enabled} small />
                </button>
              </div>
              <div className={"mb-2 " + (prefs.enabled ? "" : "pointer-events-none opacity-40")}>
                <div className="mb-1 text-[10px] font-medium text-slate-500">Notify me about</div>
                <div className="flex gap-1">
                  {([
                    { key: "all", label: "All repos" },
                    { key: "repo", label: "Active repo only" },
                  ] as const).map((o) => (
                    <button
                      key={o.key}
                      onClick={() => {
                        const next = { ...prefs, scope: o.key };
                        setPrefs(next);
                        writePrefs(next);
                      }}
                      className={
                        "flex-1 rounded border px-1.5 py-1 text-[10px] font-medium " +
                        (prefs.scope === o.key
                          ? "border-brand-600 bg-brand-600 text-white"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300")
                      }
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                {prefs.scope === "repo" && data.scopeAll && (
                  <p className="mt-1 text-[10px] leading-snug text-amber-700">
                    No repo selected in the header — nothing will notify until you pick one.
                  </p>
                )}
              </div>
              <ul className={"space-y-2 " + (prefs.enabled ? "" : "pointer-events-none opacity-40")}>
                {NOTIF_ROWS.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-800">{r.label}</span>
                      <span className="block text-[10px] leading-snug text-slate-400">{r.detail}</span>
                    </span>
                    <button onClick={() => setPref(r.key, !prefs[r.key])} aria-label={`Toggle ${r.label}`}>
                      <Switch on={prefs[r.key]} small />
                    </button>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => void runTest()}
                className="mt-2 rounded border border-slate-200 px-2 py-0.5 text-[10px] text-slate-500 hover:border-brand-500 hover:text-brand-600"
              >
                Send test notification
              </button>
              {testResult && (
                <div className="mt-1.5 text-[11px]">
                  {testResult === "sending" ? (
                    <span className="text-slate-400">Sending…</span>
                  ) : testResult.ok ? (
                    <span className="text-emerald-700">
                      Delivered via {testResult.via} — check the top-right of your screen.
                      {testResult.native_error && <span className="block text-amber-700">native path skipped: {testResult.native_error}</span>}
                    </span>
                  ) : testResult.reason === "denied" ? (
                    <span className="text-amber-700">
                      Notifications are turned off for DevBrain.{" "}
                      <button onClick={openNotificationSettings} className="underline">Open System Settings → Notifications</button>
                    </span>
                  ) : testResult.reason === "unsupported" ? (
                    <span className="text-slate-500">No notification channel here — use the desktop widget.</span>
                  ) : (
                    <span className="text-red-700">Couldn&apos;t deliver: {testResult.detail || "unknown error"}</span>
                  )}
                </div>
              )}
            </div>

            {data.lastRepo && (
              <div className="card px-2.5 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Claim an area <span className="normal-case">· {data.lastRepo.name}</span>
                </div>
                <p className="mb-1.5 text-[10px] leading-snug text-slate-400">
                  Working outside Claude Code? Claim your lane — teammates&apos; Claudes route around it.
                </p>
                <form action={createClaim} className="space-y-1.5">
                  <input type="hidden" name="repoId" value={data.lastRepo.id} />
                  <input
                    name="paths"
                    required
                    placeholder="Paths, comma-separated (e.g. src/auth/)"
                    className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  />
                  <div className="flex gap-1.5">
                    <input
                      name="note"
                      placeholder="What you're doing"
                      className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    />
                    <select name="hours" defaultValue="4" className="rounded border border-slate-200 px-1 py-1 text-xs">
                      <option value="1">1h</option>
                      <option value="2">2h</option>
                      <option value="4">4h</option>
                      <option value="8">8h</option>
                    </select>
                    <button className="rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
                      Claim
                    </button>
                  </div>
                </form>
              </div>
            )}

            {data.lastRepo && data.rules.length > 0 && (
              <div className="card px-2.5 py-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Team rules <span className="normal-case">· {data.lastRepo.name}</span>
                </div>
                <ul className="space-y-2">
                  {data.rules.map((r) => (
                    <li key={r.rule} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 text-xs text-slate-800">{r.label}</span>
                      {data.canAdmin ? (
                        <form action={toggleRule} className="flex-shrink-0">
                          <input type="hidden" name="repoId" value={data.lastRepo!.id} />
                          <input type="hidden" name="rule" value={r.rule} />
                          <input type="hidden" name="enabled" value={String(!r.on)} />
                          <input type="hidden" name="stay" value="1" />
                          <button aria-label={r.on ? "Turn off" : "Turn on"}>
                            <Switch on={r.on} small />
                          </button>
                        </form>
                      ) : (
                        <span className="flex-shrink-0 opacity-50" title="Admins only">
                          <Switch on={r.on} small />
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                  {data.canAdmin
                    ? "Rules apply to every Claude working in this repo. Full details on the dashboard Rules tab."
                    : "Only team admins can change rules. Full details on the dashboard Rules tab."}
                </p>
              </div>
            )}

            <div className="card px-2.5 py-2">
              <a
                href={data.lastRepo ? `/dashboard/${data.lastRepo.id}` : "/dashboard"}
                target="_blank"
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                Open full dashboard
              </a>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">
                Opens in your browser with History, Rules, and repo management.
              </p>
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

        {tab === "Tasks" && (
          <div className="space-y-2.5">
            {data.lastRepo && (
              <div className="card border-l-4 border-l-brand-400 px-2.5 py-2">
                <div className="mb-1.5 flex gap-1">
                  {([
                    { key: "dump", label: "Braindump" },
                    { key: "spec", label: "Context doc" },
                  ] as const).map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setCapture(m.key)}
                      className={
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider " +
                        (capture === m.key
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200")
                      }
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {capture === "dump" ? (
                  <form action={braindumpTasks}>
                    <input type="hidden" name="repoId" value={data.lastRepo.id} />
                    <textarea
                      name="dump"
                      required
                      rows={2}
                      placeholder="Dictate or type everything on your mind — DevBrain splits it into tasks…"
                      className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-xs leading-snug focus:border-brand-500 focus:outline-none"
                    />
                    <button className="mt-1 rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
                      Turn into tasks
                    </button>
                  </form>
                ) : (
                  <form action={uploadSpec}>
                    <input type="hidden" name="repoId" value={data.lastRepo.id} />
                    <input type="hidden" name="stay" value="1" />
                    <textarea
                      name="text"
                      required
                      rows={3}
                      placeholder="Paste a spec, brief, or a whole reply from another Claude session — DevBrain works out what's already built and what isn't…"
                      className="w-full resize-y rounded border border-slate-200 px-2 py-1 text-xs leading-snug focus:border-brand-500 focus:outline-none"
                    />
                    <input
                      name="title"
                      placeholder="Title (optional)"
                      className="mt-1 w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                    />
                    <button className="mt-1 rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
                      Add context
                    </button>
                    <p className="mt-1 text-[10px] leading-snug text-slate-400">
                      Analyzed within ~2 min — you&apos;ll get a notification, then review it on the dashboard.
                    </p>
                  </form>
                )}
              </div>
            )}
            {data.lastRepo && (
              <form action={createTask} className="card space-y-1.5 px-2.5 py-2">
                <input type="hidden" name="repoId" value={data.lastRepo.id} />
                <div className="flex gap-1.5">
                  <input
                    name="title"
                    required
                    placeholder={`Add task to ${data.lastRepo.name}…`}
                    className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                  />
                  <select name="priority" defaultValue="3" className="rounded border border-slate-200 px-1 py-1 text-xs">
                    <option value="1">P1</option>
                    <option value="2">P2</option>
                    <option value="3">P3</option>
                    <option value="4">P4</option>
                  </select>
                  <select name="assignee" defaultValue="" className="w-20 rounded border border-slate-200 px-1 py-1 text-xs">
                    <option value="">Anyone</option>
                    {data.members.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <input
                  name="detail"
                  placeholder="Optional detail"
                  className="w-full rounded border border-slate-200 px-2 py-1 text-xs focus:border-brand-500 focus:outline-none"
                />
                <div className="flex flex-wrap items-center gap-1">
                  {["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"].map((tag) => (
                    <label key={tag} className="cursor-pointer">
                      <input type="checkbox" name="tags" value={tag} className="peer sr-only" />
                      <span className="chip border border-slate-200 bg-white px-1 py-0 text-[10px] text-slate-500 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
                        {tag}
                      </span>
                    </label>
                  ))}
                  <input
                    name="customTags"
                    placeholder="+custom"
                    className="w-16 rounded border border-slate-200 px-1 py-0.5 text-[10px] focus:border-brand-500 focus:outline-none"
                  />
                  <button className="ml-auto rounded bg-brand-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-700">
                    Add
                  </button>
                </div>
              </form>
            )}

            {open.length === 0 ? (
              <div className="card px-2.5 py-2">
                <p className="text-xs text-slate-400">No open tasks.</p>
              </div>
            ) : (
              [1, 2, 3, 4].map((p) => {
                const group = open.filter((t) => t.priority === p);
                if (group.length === 0) return null;
                return (
                  <div key={p} className="card px-2.5 py-2">
                    <div className="mb-1.5 flex items-baseline gap-1.5">
                      <span className={`chip px-1 py-0 text-[10px] ${PRIO[p]}`}>
                        P{p} · {p === 1 ? "Critical" : p === 2 ? "High" : p === 3 ? "Medium" : "Low"}
                      </span>
                      <span className="text-[10px] text-slate-400">{group.length}</span>
                    </div>
                    <ul className="space-y-2">
                      {group.map((t) => (
                        <li key={t.id} className="text-xs">
                          <div className="flex items-start gap-2">
                            <form action={completeTask} className="mt-0.5 flex-shrink-0">
                              <input type="hidden" name="repoId" value={t.repo_id} />
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                title="Mark complete"
                                className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
                                style={{ height: 14, width: 14 }}
                              />
                            </form>
                            <TaskBody size="sm" title={t.title} detail={t.detail} />
                            <TaskMenu
                              compact
                              task={{
                                id: t.id,
                                repo_id: t.repo_id,
                                title: t.title,
                                detail: t.detail,
                                priority: t.priority,
                                tags: t.tags,
                                assigned_to: t.assigned_to,
                              }}
                              members={data.members}
                            />
                          </div>
                          {t.maybe_done_pr && (
                            <div className="ml-6 mt-0.5 flex items-center gap-1.5">
                              <span className="chip bg-amber-50 px-1 py-0 text-[10px] text-amber-800">
                                possibly done by #{t.maybe_done_pr}
                              </span>
                              <form action={confirmMaybeDone}>
                                <input type="hidden" name="repoId" value={t.repo_id} />
                                <input type="hidden" name="id" value={t.id} />
                                <button className="text-[10px] font-medium text-amber-700 hover:underline">Yes, done</button>
                              </form>
                              <form action={dismissMaybeDone}>
                                <input type="hidden" name="repoId" value={t.repo_id} />
                                <input type="hidden" name="id" value={t.id} />
                                <button className="text-[10px] text-slate-400 hover:underline">Still open</button>
                              </form>
                            </div>
                          )}
                          <div className="ml-6 mt-0.5 flex flex-wrap items-center gap-1">
                            {t.started_by && (
                              <span className="chip bg-emerald-50 px-1 py-0 text-[10px] text-emerald-700">
                                in progress · {t.started_by}
                              </span>
                            )}
                            {t.tags.map((tag) => (
                              <span key={tag} className="chip bg-slate-100 px-1 py-0 text-[10px] text-slate-500">{tag}</span>
                            ))}
                            {(t.footprint ?? []).slice(0, 2).map((fp) => (
                              <code key={fp} className="rounded bg-slate-50 px-1 text-[10px] text-slate-500 ring-1 ring-slate-200">{fp}</code>
                            ))}
                            <span className="text-[10px] text-slate-400">
                              {t.created_by} · {timeAgo(t.created_at)}
                            </span>
                            {!t.started_by && (
                              <form action={startTask}>
                                <input type="hidden" name="repoId" value={t.repo_id} />
                                <input type="hidden" name="id" value={t.id} />
                                <button className="rounded border border-slate-200 px-1.5 py-0 text-[10px] font-medium text-slate-500 hover:border-brand-500 hover:text-brand-600">
                                  Start
                                </button>
                              </form>
                            )}
                            <form action={assignTask} className="ml-auto flex items-center gap-1">
                              <input type="hidden" name="repoId" value={t.repo_id} />
                              <input type="hidden" name="id" value={t.id} />
                              <select
                                name="assignee"
                                defaultValue={t.assigned_to ?? ""}
                                className="rounded border border-slate-200 px-1 py-0 text-[10px] text-slate-600"
                              >
                                <option value="">Unassigned</option>
                                {data.members.map((m) => <option key={m} value={m}>{m}</option>)}
                              </select>
                              <button className="rounded border border-slate-200 px-1 py-0 text-[10px] text-slate-400 hover:border-brand-500 hover:text-brand-600">
                                Set
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })
            )}

            {done.length > 0 && (
              <div className="card px-2.5 py-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Completed <span className="normal-case">· auto-removes at 72h</span>
                </div>
                <ul className="space-y-1">
                  {done.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-1.5 text-xs">
                      <span className="text-emerald-600">✓</span>
                      <span className="min-w-0 flex-1 truncate text-slate-400 line-through">{t.title}</span>
                      <span className="flex-shrink-0 text-[10px] text-slate-400">{t.done_by}</span>
                      <form action={reopenTask} className="flex-shrink-0">
                        <input type="hidden" name="repoId" value={t.repo_id} />
                        <input type="hidden" name="id" value={t.id} />
                        <button className="text-[10px] text-slate-400 hover:text-brand-600">Reopen</button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {tab === "PRs" && (
          <div className="space-y-2.5">
          {data.mergePlan && (
            <div className="card border-l-4 border-l-amber-400 px-2.5 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                Suggested merge order <span className="normal-case text-slate-400">· {data.mergePlan.repo}</span>
              </div>
              <ol className="space-y-1">
                {data.mergePlan.order.map((s, i) => (
                  <li key={s.number} className="flex items-start gap-1.5 text-[11px] leading-snug">
                    <span className="mt-px flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[9px] font-bold text-white">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium text-slate-800">#{s.number} {s.title}</span>
                      <span className="block text-[10px] text-slate-500">{s.reason}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="card px-2.5 py-2">
            {data.prs.length === 0 ? (
              <p className="text-xs text-slate-400">No open pull requests.</p>
            ) : (
              <ul className="space-y-2.5">
                {data.prs.map((pr) => (
                  <li key={pr.repo_id + pr.number} className="text-xs leading-snug">
                    <a href={pr.html_url ?? "#"} target="_blank" className="font-medium text-slate-900 hover:text-brand-600">
                      <span className="text-slate-400">#{pr.number}</span> {pr.title}
                    </a>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <PrBadges pr={pr} defaultBranch={pr.defaultBranch} />
                      <span className="text-[10px] text-slate-400">{pr.repo} · {pr.author}</span>
                    </div>
                    {pr.light && (
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <span className={`inline-block h-2 w-2 flex-shrink-0 rounded-full ${LIGHT_DOT[pr.light.state] ?? LIGHT_DOT.gray}`} />
                        <span className={"text-[10px] leading-snug " + (pr.light.state === "green" ? "font-medium text-emerald-700" : "text-slate-500")}>
                          {pr.light.reason}
                        </span>
                      </div>
                    )}
                    {pr.ai && (
                      <div className="mt-1 flex items-start gap-1.5">
                        <span className={`chip flex-shrink-0 px-1 py-0 text-[10px] ${AI_CHIP[pr.ai.verdict] ?? AI_CHIP.caution}`}>
                          AI: {pr.ai.verdict.replace("_", " ")}
                        </span>
                        <span className="min-w-0 text-[10px] leading-snug text-slate-500">{pr.ai.summary}</span>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
          </div>
        )}

        {tab === "Brain" && (
          data.brain ? (
            <div>
              <div className="mb-1.5 text-[10px] text-slate-400">{data.brain.repoName} · main</div>
              <BrainExplorer
                notes={data.brain.notes}
                nodes={data.brain.nodes}
                edges={data.brain.edges}
                initialSlug="index"
                repoId={data.brain.repoId}
                branch={null}
                searchable
              />
            </div>
          ) : (
            <p className="text-xs text-slate-400">Open a repo on the dashboard once and its brain shows here.</p>
          )
        )}

        {tab === "Feed" && (
          <div className="space-y-2.5">
            {data.digest && (
              <div className="card border-l-4 border-l-brand-400 px-2.5 py-2">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
                  Standup <span className="normal-case text-slate-400">· {data.digest.repo} · {data.digest.day}</span>
                </div>
                <p className="whitespace-pre-line text-xs leading-relaxed text-slate-700">{data.digest.body}</p>
              </div>
            )}
            {(data.journals ?? []).length > 0 && (
              <div className="card px-2.5 py-2">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Session journals</div>
                <ul className="space-y-2">
                  {data.journals.map((j) => (
                    <li key={j.id} className="text-xs leading-snug text-slate-700">
                      <div className="mb-0.5 text-[10px] text-slate-400">
                        <span className="font-semibold text-slate-600">{j.by}</span>
                        {j.branch ? ` · ${j.branch}` : ""} · {j.repo} · {timeAgo(j.at)}
                      </div>
                      <p>{j.summary}</p>
                      {(j.learned.length > 0 || j.tried_and_failed.length > 0 || j.remaining) && (
                        <details className="mt-0.5">
                          <summary className="cursor-pointer text-[10px] text-brand-700">details</summary>
                          <ul className="mt-1 space-y-0.5 pl-3 text-[11px] text-slate-600">
                            {j.learned.map((l, i) => <li key={"l" + i}>· learned: {l}</li>)}
                            {j.tried_and_failed.map((l, i) => <li key={"f" + i}>· didn&apos;t work: {l}</li>)}
                            {j.remaining && <li>· remaining: {j.remaining}</li>}
                          </ul>
                        </details>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="card px-2.5 py-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Broadcasts & decisions</div>
              {data.feed.length === 0 ? (
                <p className="text-xs text-slate-400">Quiet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.feed.map((d, i) => (
                    <li key={i} className="text-xs leading-snug text-slate-700">
                      <span className={"chip mr-1 px-1 py-0 text-[10px] " + (d.kind === "broadcast" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700")}>
                        {d.kind === "broadcast" ? "B" : "D"}
                      </span>
                      {d.text}
                      <span className="text-[10px] text-slate-400"> · {d.by} · {timeAgo(d.at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="card px-2.5 py-2">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Recent work</div>
              <ActivityFeed rows={data.activity} limit={8} />
            </div>
          </div>
        )}
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
