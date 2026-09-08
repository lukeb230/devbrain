"use client";

// The panel (Dusk): the glance. Header with tabs (Home · Tasks · PRs) and a
// gear menu that only pauses notifications, picks appearance, opens the
// Desk's settings or signs out. Never a form longer than one line, never an
// admin switch — those live in the Desk. Tab switches are pure client state.

import React, { useEffect, useRef, useState, useTransition } from "react";
import { mintDeviceToken, setWidgetRepo } from "./actions";
import { dismissAlert } from "../settings/org/alert-actions";
import { BrainMark } from "@/components/BrainMark";
import { Pulse } from "./pulse";
import { applyThemePref, applyThemeToDocument, readThemePref, THEME_KEY, type ThemePref } from "./theme";
import { createClaim } from "../dashboard/[repoId]/claim-actions";
import { pickSuggestedNext } from "@/lib/lanes";
import type { ActivityRow } from "@/components/ActivityFeed";
import { pickupHandoff } from "../dashboard/[repoId]/handoff-actions";
import { completeTask, confirmMaybeDone, createTask, dismissMaybeDone, startTask, togglePin } from "../dashboard/[repoId]/tasks/actions";
import type { NotePayload } from "../dashboard/[repoId]/brain/explorer";
import { buildNeeds } from "@/lib/desk/needs-you";
import type { GEdge, GNode } from "../dashboard/[repoId]/brain/graph";
import { WidgetBadge } from "./badge";
import { WidgetLive } from "./live";
import { DEFAULT_PREFS, PREFS_EVENT, readPrefs, WidgetNotifier, writePrefs, type NotifPrefs } from "./notifier";

export interface WidgetData {
  deploy: string;
  sessions: { id: string; repo: string; dev_label: string; root?: string; summary: string | null; last_seen: string; started_at?: string | null }[];
  collisions: { repo: string; file: string; branches: string[] }[];
  prs: { repo_id: string; repo: string; defaultBranch: string; number: number; title: string; author: string | null; review_state: string | null; draft: boolean; mergeable_state: string | null; html_url: string | null; ai: { verdict: string; summary: string } | null; light: { state: string; reason: string } | null }[];
  tasks: { id: string; pinned: boolean; repo_id: string; repo: string; title: string; detail: string | null; priority: number; tags: string[]; assigned_to: string | null; status: string; done_by: string | null; created_by: string | null; created_at: string; maybe_done_pr: number | null; started_by: string | null; footprint: string[] | null }[];
  claims: { id: string; repo_id: string; repo: string; dev_label: string; paths: string[]; note: string | null; expires_at: string | null }[];
  members: string[];
  feed: { kind: string; text: string; by: string | null; at: string }[];
  journals: { id: string; repo: string; by: string; branch: string | null; summary: string; learned: string[]; tried_and_failed: string[]; remaining: string | null; at: string }[];
  handoffs: { id: string; repo_id: string; repo: string; by: string | null; branch: string | null; summary: string; remaining: string | null; at: string }[];
  alerts: { id: string; severity: string; title: string; count: number }[];
  canAdmin: boolean;
  operator: boolean;          // this team is the deployment's operator → its admins also get ops alerts
  teamId: string;
  teamName: string;
  teams: { id: string; name: string }[];          // owner/admin of the active org — gates rule toggles + reminders mapping
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



const TABS = ["Home", "Tasks", "PRs"] as const;
type Tab = (typeof TABS)[number];


function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
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
// Outward links. `target="_blank"` asks the webview for a new window, which
// the shell never creates — so inside the app every external link goes
// through the opener command instead. In a browser it behaves normally.
/** Open the Desk window on a route (e.g. "/prs"). Inside the app this is the
 *  open_desk command; in a plain browser it falls back to /desk in a tab. */
function openDesk(e: React.MouseEvent, route: string, browserFallback: string) {
  const w = window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } }; __devbrainChannel?: string };
  const core = w.__TAURI__?.core;
  if (!core) return; // plain browser: let the anchor navigate (target=_blank) to the Desk route
  e.preventDefault();
  void core.invoke("open_desk", { route }).catch(() => {
    // IPC refused (an older shell, a capability mismatch): the app's own URL
    // scheme still reaches it. Only a shell without the Desk at all lands in
    // the browser.
    const scheme = w.__devbrainChannel === "beta" ? "devbrain-beta" : w.__devbrainChannel === "stable" ? "devbrain" : null;
    if (scheme) window.location.href = `${scheme}://desk${route}`;
    else window.open(browserFallback, "_blank");
  });
}

function openExternal(e: React.MouseEvent, url: string) {
  const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
  if (!core || !url || url === "#") return;
  e.preventDefault();
  const abs = url.startsWith("http") ? url : `${window.location.origin}${url}`;
  void core.invoke("open_external", { url: abs }).catch(() => window.open(abs, "_blank"));
}

export function WidgetApp({ data }: { data: WidgetData }) {
  const [tab, setTab] = useState<Tab>("Home");
  const [menu, setMenu] = useState(false);
  // First-run: inside the desktop app with no ~/.devbrain/config.json yet.
  const [setup, setSetup] = useState<SetupState | null>(null);
  useEffect(() => {
    const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
    if (!core) return;
    core.invoke("setup_state").then((s) => {
      setSetup(s as SetupState);
      (window as unknown as { __devbrainChannel?: string }).__devbrainChannel = (s as { channel?: string })?.channel;
    }).catch(() => {});
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
  const [themePref, setThemePref] = useState<ThemePref>("light");
  useEffect(() => {
    setThemePref(readThemePref());
    // The Desk's This Mac page writes the same key: follow it live.
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) { const p = readThemePref(); setThemePref(p); applyThemeToDocument(p); } };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  const pickTheme = (p: ThemePref) => { setThemePref(p); applyThemePref(p); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  // Notification prefs live in localStorage, shared with the Desk's This Mac
  // page; the gear only pauses them. (PREFS_EVENT fires on any write.)
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    setPrefs(readPrefs());
    const sync = () => setPrefs(readPrefs());
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(PREFS_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const pause = (mode: "hour" | "tomorrow" | "off") => {
    const until = mode === "hour" ? Date.now() + 3600_000 : mode === "tomorrow" ? new Date(new Date().setHours(24, 0, 0, 0)).getTime() : 0;
    const next = { ...prefs, pausedUntil: until };
    setPrefs(next);
    writePrefs(next);
  };
  const pausedMode: "hour" | "tomorrow" | "off" = !prefs.pausedUntil || prefs.pausedUntil <= Date.now() ? "off" : prefs.pausedUntil - Date.now() <= 3600_000 + 5000 ? "hour" : "tomorrow";
  const open = data.tasks.filter((t) => t.status === "open");

  if (setup && !setup.configured) {
    let skipped = false;
    try { skipped = sessionStorage.getItem("devbrain_skip_setup") === "1"; } catch { /* private mode */ }
    if (!skipped) return <SetupScreen state={setup} repos={data.repos} canAdmin={data.canAdmin} onDone={() => window.location.reload()} />;
  }

  const isMe = (name: string | null | undefined) => Boolean(data.self && name && name.toLowerCase() === data.self.toLowerCase());
  const hourAgo = Date.now() - 3600_000;
  const peopleLastHour = new Set(data.activity.filter((a) => new Date(a.at).getTime() > hourAgo).map((a) => a.dev_label ?? "")).size;
  const repoQ = data.lastRepo ? `?repo=${data.lastRepo.id}` : "";
  const desk = (e: React.MouseEvent, route: string) => openDesk(e, route, `/desk${route}`);
  const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

  // The dispatcher's pick for you — the same rule Claude gets in its context.
  const othersBusy: string[] = [];
  for (const c of data.claims) if (!isMe(c.dev_label)) othersBusy.push(...c.paths);
  for (const t of open) if (t.started_by && !isMe(t.started_by)) othersBusy.push(...(t.footprint ?? []));
  const suggested = data.self ? pickSuggestedNext(open.filter((t) => !t.maybe_done_pr).map((t) => ({ id: t.id, title: t.title, priority: t.priority, tags: t.tags, assigned_to: t.assigned_to, started_by: t.started_by, footprint: t.footprint, created_at: t.created_at })), data.self, othersBusy) : null;
  const suggestedTask = suggested ? open.find((t) => t.id === suggested.id) ?? null : null;
  const reasonFor = (s: NonNullable<typeof suggested>) => `${s.footprint && s.footprint.length > 0 ? "" : ""}${suggestedTask?.assigned_to ? "Assigned to you" : "Unassigned"} · P${s.priority} · ${s.footprint && s.footprint.length > 0 ? `its lane (${s.footprint.slice(0, 3).join(", ")}) is free — nobody's claim or started task overlaps it.` : "footprint not predicted yet — check who's editing before starting."}`;

  // --- presentation bits (Dusk panel) -------------------------------------
  const ACT = "font-display text-[11.5px] font-semibold text-accent hover:underline";
  const ACT_MUTED = "font-display text-[11.5px] font-semibold text-muted hover:text-txt";
  const PRIMARY = "whitespace-nowrap rounded-lg bg-accent2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-white";
  const Sec = ({ title, count, right, className = "mt-[18px]" }: { title: string; count?: React.ReactNode; right?: React.ReactNode; className?: string }) => (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span className="font-display text-[13px] font-semibold text-txt">{title}</span>
      {count !== undefined && <span className="font-mono text-[10.5px] text-accent">{count}</span>}
      {right && <span className="ml-auto font-mono text-[10px] uppercase tracking-[.12em] text-faint">{right}</span>}
    </div>
  );
  const Row = ({ first, children }: { first?: boolean; children: React.ReactNode }) => <div className={`flex items-center gap-2.5 py-[9px] ${first ? "" : "border-t border-line"}`}>{children}</div>;
  const Dot = ({ level }: { level: "stop" | "wait" | "go" | "dim" }) => <i className={"h-[7px] w-[7px] flex-shrink-0 rounded-full " + { stop: "bg-stop shadow-[0_0_8px_var(--wg-stop)]", wait: "bg-wait", go: "bg-go shadow-[0_0_8px_var(--wg-go)]", dim: "bg-faint" }[level]} />;
  const Pri = ({ p }: { p: number }) => <span className={"w-[18px] font-mono text-[10px] " + (p === 1 ? "text-stop" : p === 2 ? "text-wait" : p === 3 ? "text-muted" : "text-faint")}>P{p}</span>;
  const Pin = ({ t }: { t: { id: string; repo_id: string; pinned: boolean } }) => (
    <form action={togglePin} className="flex-shrink-0">
      <input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /><input type="hidden" name="pinned" value={String(!t.pinned)} />
      <button title={t.pinned ? "Unpin from Home" : "Pin to Home"} className={"text-[12px] " + (t.pinned ? "text-accent" : "text-faint hover:text-muted")}>⌖</button>
    </form>
  );
  const Hidden = ({ t }: { t: { id: string; repo_id: string } }) => (<><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /></>);
  const Seg = <T extends string>({ options, value, onPick }: { options: { key: T; label: string }[]; value: T; onPick: (k: T) => void }) => (
    <span className="inline-flex rounded-lg border border-line2 p-0.5">
      {options.map((o) => <button key={o.key} onClick={() => onPick(o.key)} className={"rounded-md px-2 py-[3px] font-display text-[11px] font-semibold " + (o.key === value ? "bg-row2 text-txt" : "text-muted hover:text-txt")}>{o.label}</button>)}
    </span>
  );

  const needs = buildNeeds({ self: data.self, scopeAll: data.scopeAll, prs: data.prs, tasks: data.tasks, claims: data.claims, collisions: data.collisions, handoffs: data.handoffs, fmtAgo: timeAgo });
  const cta = (n: (typeof needs)[number]) =>
    n.action.kind === "github" ? <a href={n.action.url ?? "#"} target="_blank" onClick={(e) => openExternal(e, n.action.kind === "github" ? n.action.url ?? "#" : "#")} className={ACT}>{n.action.label}</a>
    : n.action.kind === "tab" ? <button onClick={() => setTab(n.action.kind === "tab" && (n.action.tab === "Tasks" || n.action.tab === "PRs") ? n.action.tab : "Home")} className={ACT}>{n.action.label}</button>
    : n.action.kind === "start_task" ? <form action={startTask}><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.taskId} /><button className={ACT}>Start</button></form>
    : <form action={pickupHandoff}><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.handoffId} /><button className={ACT}>Pick up</button></form>;

  return (
    <div className="flex h-screen flex-col bg-ink text-[13.5px] text-txt">
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
        admin={data.canAdmin}
        teamId={data.teamId}
        operator={data.operator}
        activeRepoId={data.scopeAll ? null : (data.lastRepo?.id ?? null)}
        prSeeds={data.prs.map((p) => ({ repo_id: p.repo_id, number: p.number, mergeable_state: p.mergeable_state, review_state: p.review_state }))}
      />

      {/* Header: mark + wordmark + live dot · team name · repo · gear */}
      <div className="relative flex flex-shrink-0 items-center gap-2.5 bg-row px-4 pb-2 pt-3.5">
        <BrainMark size={20} id="wg" className="flex-shrink-0 drop-shadow-[0_0_6px_var(--wg-glow)]" />
        <span className="font-display text-[15px] font-bold tracking-[-.02em] text-txt">DevBrain</span>
        <WidgetLive />
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11.5px] text-faint">{data.teamName}</span>
          {data.repos.length > 0 && (
            <select
              value={data.scopeAll ? "all" : (data.lastRepo?.id ?? "all")}
              disabled={switching}
              onChange={(e) => { const id = e.target.value; if (id) startSwitch(() => setWidgetRepo(id)); }}
              title="Scope — filters everything in the panel to one repo"
              className={"max-w-[150px] truncate rounded-md border border-line2 bg-ink px-1.5 py-[3px] font-mono text-[11px] text-txt focus:outline-none " + (switching ? "opacity-50" : "")}
            >
              <option value="all">All repos</option>
              {data.repos.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </span>
        <button onClick={() => setMenu((m) => !m)} aria-label="Settings" title="Settings" className={"text-[15px] leading-none " + (menu ? "text-accent2" : "text-muted hover:text-txt")}>⚙</button>
        {menu && (
          <>
            <div className="fixed inset-0 z-[4]" onClick={() => setMenu(false)} />
            <div className="absolute right-3.5 top-11 z-[5] w-[256px] rounded-xl border border-line2 bg-row p-1.5 text-[13px] text-txt shadow-[var(--wg-shadow)]">
              <div className="flex items-center justify-between rounded-lg px-2.5 py-2"><span>Pause notifications</span><span className="font-mono text-[10px] text-faint">{pausedMode === "off" ? "off" : pausedMode === "hour" ? `until ${hhmm(new Date(prefs.pausedUntil!).toISOString())}` : "until tomorrow"} ▸</span></div>
              <div className="mx-2.5 mb-1 flex gap-1">
                {([["hour", "1 hour"], ["tomorrow", "until tomorrow"], ["off", "off"]] as const).map(([k, label]) => (
                  <button key={k} onClick={() => pause(k)} className={"flex-1 rounded-md border border-line2 py-[3px] text-center font-display text-[10.5px] font-semibold " + (pausedMode === k ? "bg-row2 text-txt" : "text-muted hover:text-txt")}>{label}</button>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-lg px-2.5 py-2"><span>Appearance</span><Seg options={[{ key: "light", label: "Light" }, { key: "system", label: "System" }, { key: "dark", label: "Dark" }]} value={themePref} onPick={pickTheme} /></div>
              <div className="my-1 border-t border-line" />
              <a href="/desk/mac" target="_blank" onClick={(e) => { setMenu(false); desk(e, "/mac"); }} className="block rounded-lg px-2.5 py-2 font-display text-[12.5px] font-semibold text-accent hover:bg-row2">Open settings in the Desk →</a>
              <form action="/auth/sign-out" method="post"><button className="block w-full rounded-lg px-2.5 py-2 text-left text-[12.5px] text-muted hover:bg-row2 hover:text-txt">Sign out</button></form>
            </div>
          </>
        )}
      </div>

      {/* Tabs under the header */}
      <div className="flex flex-shrink-0 border-b border-line bg-row px-2.5">
        {TABS.map((t) => {
          const active = tab === t;
          const attention = t === "PRs" ? data.conflicted > 0 : t === "Tasks" ? open.some((x) => x.priority === 1 && !x.started_by && (!x.assigned_to || isMe(x.assigned_to))) : false;
          return (
            <button key={t} onClick={() => { setTab(t); setMenu(false); }} aria-current={active ? "page" : undefined} className={"relative flex-1 border-b-2 py-[7px] text-center font-display text-[12px] font-medium " + (active ? "border-accent2 text-accent" : "border-transparent text-muted hover:text-txt")}>
              {t}
              {attention && !active && <i className="absolute right-[26%] top-2 h-[5px] w-[5px] rounded-full bg-wait" />}
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        {tab === "Home" && (
          <>
            <Pulse
              activity={data.activity}
              events={[...data.feed.map((f) => ({ at: f.at, kind: f.kind })), ...data.handoffs.map((h) => ({ at: h.at, kind: "handoff" }))]}
              collision={data.collisions.length > 0}
              people={peopleLastHour}
              prEvents={data.prs.length}
            />
            {data.notice && <div className="mt-2 rounded-lg border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3 py-[7px] text-[12px] text-wait">{data.notice === "owner_only" ? "Only the team owner can do that." : data.notice === "no_access" ? "You're not signed in to this team — reload the panel." : "Only team admins and owners can do that."}</div>}
            {data.alerts.map((a) => (
              <div key={a.id} className={"mt-2 flex items-center gap-2.5 rounded-lg border px-3 py-[7px] text-[12px] " + (a.severity === "error" ? "border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] text-stop" : "border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] text-wait")}>
                <span className="min-w-0 flex-1 truncate font-medium">{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</span>
                <form action={dismissAlert}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="stay" value="1" /><button className="text-[11.5px] opacity-80 hover:opacity-100">dismiss</button></form>
              </div>
            ))}

            <Sec title="Needs you" count={needs.length} />
            {needs.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">Nothing needs you right now.</p> : needs.slice(0, 5).map((n, i) => (
              <Row key={n.key} first={i === 0}>
                <Dot level={n.level} />
                <div className="min-w-0 flex-1"><div className="text-[13px] text-txt">{n.title}</div><div className="truncate text-[11.5px] text-muted">{n.why}</div></div>
                {cta(n)}
              </Row>
            ))}
            {needs.length > 5 && <div className="border-t border-line pt-1.5 font-mono text-[10px] text-faint">+{needs.length - 5} more in the Desk</div>}

            <div className="mt-3.5 grid grid-cols-4 gap-2">
              {[
                { n: data.prs.length, l: "PRs", t: "PRs" as Tab, warn: false },
                { n: data.conflicted, l: data.conflicted === 1 ? "conflict" : "conflicts", t: "PRs" as Tab, warn: data.conflicted > 0 },
                { n: data.collisions.length, l: data.collisions.length === 1 ? "collision" : "collisions", t: "PRs" as Tab, warn: data.collisions.length > 0 },
                { n: open.length, l: "open tasks", t: "Tasks" as Tab, warn: false },
              ].map((c) => (
                <button key={c.l} onClick={() => setTab(c.t)} className="rounded-lg border border-line px-2.5 py-[9px] text-left hover:border-line2">
                  <span className={"block font-display text-[22px] font-bold leading-none tracking-[-.03em] " + (c.warn ? "text-stop" : "text-txt")}>{c.n}</span>
                  <span className="mt-1 block font-mono text-[10px] text-faint">{c.l}</span>
                </button>
              ))}
            </div>

            {(() => {
              const seen = new Set<string>();
              const pick = (pred: (t: (typeof open)[number]) => boolean) => open.filter((t) => !seen.has(t.id) && pred(t)).map((t) => { seen.add(t.id); return t; });
              const list = [...pick((t) => t.pinned), ...pick((t) => t.priority === 1), ...pick((t) => t.priority === 2 && isMe(t.assigned_to))].slice(0, 6);
              return (
                <>
                  <Sec title="Pinned" count={list.length} right="start · done only" />
                  {list.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">No pinned or critical tasks. Pin any task from the Tasks tab or the Desk to keep it here.</p> : list.map((t, i) => (
                    <Row key={t.id} first={i === 0}>
                      <Pri p={t.priority} />
                      <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{t.title}</div><div className="text-[11.5px] text-muted">{t.started_by ? `${isMe(t.started_by) ? "you" : t.started_by} · in progress` : `${t.assigned_to ? (isMe(t.assigned_to) ? "you" : t.assigned_to) : "unassigned"} · open`}{data.scopeAll ? ` · ${t.repo}` : ""}</div></div>
                      {!t.started_by && <form action={startTask}><Hidden t={t} /><button className={ACT}>Start</button></form>}
                      <form action={completeTask}><Hidden t={t} /><button className={ACT_MUTED}>Done</button></form>
                      <Pin t={t} />
                    </Row>
                  ))}
                </>
              );
            })()}

            <Sec title="Team now" count={data.sessions.length} />
            {data.sessions.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">Nobody active right now. Presence appears within a turn of a teammate starting a session.</p> : (() => {
              const groups = new Map<string, typeof data.sessions>();
              for (const s of data.sessions) { const k = (s.root ?? s.dev_label).toLowerCase(); if (!groups.has(k)) groups.set(k, []); groups.get(k)!.push(s); }
              return [...groups.values()].slice(0, 8).map((g, i) => {
                const lead = g[0];
                const name = lead.root ?? lead.dev_label;
                const busy = g.find((s) => s.summary) ?? lead;
                const me = isMe(name);
                const since = [...g].map((s) => s.started_at).filter(Boolean).sort()[0] ?? null;
                return (
                  <div key={lead.id} className={"flex items-center gap-2.5 py-2 " + (i === 0 ? "" : "border-t border-line")}>
                    <span className={"relative grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg border font-display text-[11px] font-semibold " + (me ? "border-coralline bg-coralink text-accent" : "border-line2 bg-row2 text-txt")}>
                      {(name.trim()[0] ?? "?").toUpperCase()}
                      <i className="absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full border-2 border-ink bg-go" />
                      {g.length > 1 && <b className="absolute -right-2 -top-1.5 rounded-full bg-accent2 px-1 font-mono text-[9px] font-normal leading-[13px] text-white">×{g.length}</b>}
                    </span>
                    <div className="min-w-0 flex-1"><div className={"text-[13px] " + (me ? "text-accent" : "text-txt")}>{me ? "you" : name}</div><div className="truncate text-[11.5px] text-muted">{busy.summary || (data.scopeAll ? lead.repo : `active ${timeAgo(lead.last_seen)} ago`)}</div></div>
                    {since && <span className="font-mono text-[10.5px] text-faint">since {hhmm(since)}</span>}
                  </div>
                );
              });
            })()}

            <Sec title="Open handoffs" count={data.handoffs.length} />
            {data.handoffs.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">No open handoffs.</p> : data.handoffs.slice(0, 4).map((h, i) => (
              <Row key={h.id} first={i === 0}>
                <Dot level="wait" />
                <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{h.by ?? "someone"}{h.branch ? ` · ${h.branch}` : ""}{data.scopeAll ? ` · ${h.repo}` : ""}</div><div className="truncate text-[11.5px] text-muted">{h.summary}{h.remaining ? ` — remaining: ${h.remaining}` : ""}</div></div>
                {!isMe(h.by) && <form action={pickupHandoff}><input type="hidden" name="repoId" value={h.repo_id} /><input type="hidden" name="id" value={h.id} /><button className={ACT}>Pick up</button></form>}
              </Row>
            ))}

            {data.lastRepo && (
              <>
                <Sec title="Claim a lane" right="teammates' Claudes route around it" />
                <form action={createClaim} className="mt-1.5 flex gap-2">
                  <input type="hidden" name="repoId" value={data.lastRepo.id} />
                  <input name="paths" required placeholder="Path prefix, e.g. src/auth/" className="min-w-0 flex-1 rounded-lg border border-line2 bg-row px-3 py-2 text-[12.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
                  <select name="hours" defaultValue="4" className="rounded-lg border border-line2 bg-transparent px-2 py-2 font-mono text-[11px] text-txt focus:outline-none"><option value="1">1h</option><option value="2">2h</option><option value="4">4h</option><option value="8">8h</option><option value="24">24h</option></select>
                  <button className={PRIMARY}>Claim</button>
                </form>
              </>
            )}

            <a href={`/desk${repoQ}`} target="_blank" onClick={(e) => desk(e, `/${repoQ}`)} className="mt-[18px] flex items-center gap-2 rounded-[10px] border border-line2 px-3.5 py-2.5 font-display text-[12.5px] font-semibold text-accent hover:border-line3">
              Open the Desk <span className="ml-auto font-mono text-[10px] font-normal text-faint">board · PRs · brain · feed · team</span>→
            </a>
          </>
        )}

        {tab === "Tasks" && (() => {
          const now = open.filter((t) => isMe(t.started_by)).sort((a, b) => a.priority - b.priority);
          const queue = open.filter((t) => isMe(t.assigned_to) && !isMe(t.started_by)).sort((a, b) => a.priority - b.priority);
          const unassigned = open.filter((t) => !t.assigned_to && !t.started_by && !t.maybe_done_pr).sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
          const maybe = open.filter((t) => t.maybe_done_pr);
          const laneFor = (t: (typeof open)[number]) => data.claims.find((c) => isMe(c.dev_label) && c.repo_id === t.repo_id);
          const hoursLeft = (iso: string | null) => (iso ? Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 3600_000)) : null);
          return (
            <>
              {data.lastRepo ? (
                <form action={createTask} className="mt-3 flex gap-2">
                  <input type="hidden" name="repoId" value={data.lastRepo.id} /><input type="hidden" name="priority" value="3" />
                  <input name="title" required placeholder="Quick add — what needs doing? ↵" className="min-w-0 flex-1 rounded-lg border border-line2 bg-row px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
                  <button className={PRIMARY}>Add</button>
                </form>
              ) : (
                <p className="mt-3 text-[12px] text-faint">Pick a repo in the header to add tasks.</p>
              )}
              {suggested && suggestedTask && (
                <div className="mt-3.5 rounded-xl border border-coralline bg-coralink px-3.5 py-3">
                  <div className="font-mono text-[10px] uppercase tracking-[.12em] text-accent">next for you</div>
                  <div className="mt-1.5 font-display text-[16px] font-semibold tracking-[-.01em] text-txt">{suggested.title}</div>
                  <div className="mt-1 text-[12px] leading-[1.5] text-muted">{reasonFor(suggested)}</div>
                  <div className="mt-2.5"><form action={startTask}><Hidden t={suggestedTask} /><button className={PRIMARY}>Start</button></form></div>
                </div>
              )}
              <Sec title="In progress" count={now.length} />
              {now.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">Nothing in progress. Start one below — or tell your Claude which task you&apos;re taking and it will start it for you.</p> : now.map((t, i) => {
                const lane = laneFor(t);
                return (
                  <Row key={t.id} first={i === 0}>
                    <Pri p={t.priority} />
                    <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{t.title}</div><div className="truncate text-[11.5px] text-muted">you{lane ? ` · lane ${lane.paths[0]}${lane.paths.length > 1 ? ` +${lane.paths.length - 1}` : ""}${hoursLeft(lane.expires_at) ? ` · ${hoursLeft(lane.expires_at)}h left` : ""}` : ""}{data.scopeAll ? ` · ${t.repo}` : ""}</div></div>
                    <form action={completeTask}><Hidden t={t} /><button className={ACT_MUTED}>Done</button></form>
                  </Row>
                );
              })}
              <Sec title="Assigned to you" count={queue.length} />
              {queue.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">Nothing queued for you.</p> : queue.map((t, i) => (
                <Row key={t.id} first={i === 0}>
                  <Pri p={t.priority} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{t.title}</div><div className="truncate text-[11.5px] text-muted">{t.tags.length ? `${t.tags.join(", ")} · ` : ""}created {timeAgo(t.created_at)} ago{data.scopeAll ? ` · ${t.repo}` : ""}</div></div>
                  <form action={startTask}><Hidden t={t} /><button className={ACT}>Start</button></form>
                  <form action={completeTask}><Hidden t={t} /><button className={ACT_MUTED}>Done</button></form>
                  <Pin t={t} />
                </Row>
              ))}
              <Sec title="Unassigned" count={unassigned.length} right="start takes it" />
              {unassigned.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">Nothing unassigned.</p> : unassigned.map((t, i) => (
                <Row key={t.id} first={i === 0}>
                  <Pri p={t.priority} />
                  <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{t.title}</div><div className="truncate text-[11.5px] text-muted">{t.tags.length ? `${t.tags.join(", ")} · ` : ""}{t.created_by ? `${isMe(t.created_by) ? "you" : t.created_by} · ` : ""}created {timeAgo(t.created_at)} ago{data.scopeAll ? ` · ${t.repo}` : ""}</div></div>
                  <form action={startTask}><Hidden t={t} /><button className={ACT}>Start</button></form>
                  <form action={completeTask}><Hidden t={t} /><button className={ACT_MUTED}>Done</button></form>
                  <Pin t={t} />
                </Row>
              ))}
              {maybe.length > 0 && (
                <>
                  <Sec title="Possibly done" count={maybe.length} />
                  {maybe.map((t, i) => (
                    <Row key={t.id} first={i === 0}>
                      <Dot level="wait" />
                      <div className="min-w-0 flex-1"><div className="truncate text-[13px] text-txt">{t.title}</div><div className="text-[11.5px] text-muted">PR #{t.maybe_done_pr} looks like it closed it</div></div>
                      <form action={confirmMaybeDone}><Hidden t={t} /><button className="font-display text-[11.5px] font-semibold text-go hover:underline">Yes, done</button></form>
                      <form action={dismissMaybeDone}><Hidden t={t} /><button className="font-display text-[11.5px] font-semibold text-faint hover:text-txt">Still open</button></form>
                    </Row>
                  ))}
                </>
              )}
              <p className="mt-[18px] text-[12px] text-faint">Everything else — teammates&apos; tasks, braindump, edit, assign, delete — lives in the Desk. <a href={`/desk/board${repoQ}`} target="_blank" onClick={(e) => desk(e, `/board${repoQ}`)} className={ACT}>Open Board →</a></p>
            </>
          );
        })()}

        {tab === "PRs" && (() => {
          const order = data.mergePlan?.order.map((o) => o.number) ?? [];
          const sorted = [...data.prs].sort((x, y) => {
            const ix = order.indexOf(x.number), iy = order.indexOf(y.number);
            if (ix !== -1 || iy !== -1) return (ix === -1 ? 99 : ix) - (iy === -1 ? 99 : iy);
            return 0;
          });
          const level = (pr: (typeof sorted)[number]): "go" | "wait" | "stop" | "dim" => pr.draft || !pr.light ? "dim" : pr.light.state === "green" ? "go" : pr.light.state === "red" || pr.mergeable_state === "dirty" ? "stop" : "wait";
          const word = (pr: (typeof sorted)[number]) => pr.draft ? "draft — not in the merge order" : pr.light ? `${pr.light.state === "green" ? "cleared" : pr.light.state === "red" ? "conflicts" : "hold"}${pr.light.reason ? ` — ${pr.light.reason}` : ""}` : "pending";
          const vtone = (v: string) => v === "looks_good" ? "text-go" : v === "risky" ? "text-stop" : v === "caution" ? "text-wait" : "text-faint";
          return (
            <>
              <div className="mt-3 font-mono text-[10px] uppercase tracking-[.12em] text-faint">{data.prs.length} open{data.conflicted > 0 ? <> · <span className="text-stop">{data.conflicted} conflict{data.conflicted === 1 ? "" : "s"}</span></> : ""} · lights are deterministic</div>
              <div className="mt-1.5">
                {sorted.length === 0 ? <p className="py-2 text-[12.5px] leading-[1.55] text-faint">No open pull requests.</p> : sorted.map((pr, i) => (
                  <a key={pr.repo_id + pr.number} href={`/desk/prs/${pr.number}?repo=${pr.repo_id}`} target="_blank" onClick={(e) => desk(e, `/prs/${pr.number}?repo=${pr.repo_id}`)} className={"flex items-center gap-2.5 py-[9px] " + (i === 0 ? "" : "border-t border-line") + (pr.draft ? " text-faint" : "")}>
                    <Dot level={level(pr)} />
                    <div className="min-w-0 flex-1">
                      <div className={"truncate text-[13px] " + (pr.draft ? "" : "text-txt")}><span className={"mr-1.5 font-mono text-[11px] " + (pr.draft ? "" : "text-muted")}>#{pr.number}</span>{pr.title}</div>
                      <div className={"truncate text-[11.5px] " + (pr.draft ? "" : "text-muted")}>{pr.author ?? "?"} · {word(pr)}{data.scopeAll ? ` · ${pr.repo}` : ""}</div>
                    </div>
                    <span className={"font-mono text-[10.5px] " + (pr.ai ? vtone(pr.ai.verdict) : "text-faint")}>{pr.ai ? `AI · ${pr.ai.verdict.replace("_", " ")}` : "—"}</span>
                  </a>
                ))}
              </div>
              <p className="mt-[18px] text-[12px] text-faint">Merge plan, rebase commands and review points are in the Desk. <a href={`/desk/prs${repoQ}`} target="_blank" onClick={(e) => desk(e, `/prs${repoQ}`)} className={ACT}>Open Pull requests →</a></p>
            </>
          );
        })()}
      </div>
    </div>
  );
}
