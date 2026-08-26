"use client";

// The widget mini-app: a Home tab that fits the panel with NO scrolling
// (tasks + who's working — the glance content), and a bottom tab bar for
// Tasks / PRs / Brain / Feed. Tab switches are instant (pure client state).

import { useEffect, useRef, useState, useTransition } from "react";
import { setWidgetRepo } from "./actions";
import { ActivityFeed, type ActivityRow } from "@/components/ActivityFeed";
import { TaskBody } from "@/components/TaskBody";
import { BrainMark } from "@/components/BrainMark";
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
  activity: ActivityRow[];
  brain: { notes: NotePayload[]; nodes: GNode[]; edges: GEdge[]; repoId: string; repoName: string } | null;
  lastRepo: { id: string; name: string } | null;
  conflicted: number;
  rules: { rule: string; label: string; on: boolean }[];
  self: string | null;
  repos: { id: string; name: string }[];
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

  return (
    <div className="flex h-screen flex-col bg-slate-50">
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
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <span className="flex items-center gap-1.5">
          <BrainMark size={18} id="wg" className="flex-shrink-0 text-brand-600" />
          <span className="text-sm font-semibold text-slate-900">DevBrain</span>
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
                "max-w-[130px] truncate rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700 focus:border-brand-500 focus:outline-none " +
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
              "rounded-md p-1 " +
              (tab === "Settings" ? "bg-brand-50 text-brand-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700")
            }
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </span>
      </div>

      {/* Content */}
      <div className={"min-h-0 flex-1 px-3 py-2.5 " + (tab === "Home" ? "overflow-hidden" : "overflow-y-auto")}>
        {tab === "Settings" && (
          <div className="space-y-2.5">
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
                      <form action={toggleRule} className="flex-shrink-0">
                        <input type="hidden" name="repoId" value={data.lastRepo!.id} />
                        <input type="hidden" name="rule" value={r.rule} />
                        <input type="hidden" name="enabled" value={String(!r.on)} />
                        <button aria-label={r.on ? "Turn off" : "Turn on"}>
                          <Switch on={r.on} small />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                  Rules apply to every Claude working in this repo. Full details on the dashboard Rules tab.
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
          <div className="flex h-full flex-col gap-2.5">
            {data.collisions.length > 0 && (
              <div className="card flex-shrink-0 border-l-4 border-l-amber-400 px-2.5 py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">Collisions</div>
                {data.collisions.slice(0, 2).map((c) => (
                  <div key={c.repo + c.file} className="truncate text-xs text-slate-700">
                    <code className="text-amber-800">{c.file}</code>
                    <span className="text-slate-400"> · {c.branches.join(" + ")}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Always visible — an empty lanes card is information too. */}
            <div className="card flex-shrink-0 px-2.5 py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Claimed lanes</div>
                {data.claims.length === 0 && (
                  <p className="text-xs text-slate-400">
                    None active. Start a task (Tasks tab) or claim an area (Settings).
                  </p>
                )}
                {data.claims.slice(0, 3).map((c) => (
                  <div key={c.id} className="flex items-center gap-1.5 text-xs text-slate-700">
                    <span className="font-medium">{c.dev_label}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {c.paths.slice(0, 2).map((p) => (
                        <code key={p} className="mr-1 rounded bg-slate-100 px-1 text-[10px] text-slate-600">{p}</code>
                      ))}
                      {c.note && <span className="text-[10px] text-slate-400">{c.note}</span>}
                    </span>
                    {c.expires_at && (
                      <span className="flex-shrink-0 text-[10px] text-slate-400">
                        {Math.max(1, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 3600_000))}h
                      </span>
                    )}
                    <form action={releaseClaim} className="flex-shrink-0">
                      <input type="hidden" name="repoId" value={c.repo_id} />
                      <input type="hidden" name="id" value={c.id} />
                      <button className="text-[10px] text-slate-400 hover:text-brand-600">release</button>
                    </form>
                  </div>
                ))}
            </div>

            {data.handoffs.length > 0 && (
              <div className="card flex-shrink-0 border-l-4 border-l-brand-400 px-2.5 py-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-brand-700">Unfinished — resume?</div>
                {data.handoffs.slice(0, 2).map((h) => (
                  <div key={h.id} className="truncate text-xs text-slate-700">
                    <span className="font-medium">{h.summary}</span>
                    <span className="text-slate-400"> · {h.by} · {h.repo} · {timeAgo(h.at)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="card flex-shrink-0 px-2.5 py-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Now working</div>
              {data.sessions.length === 0 ? (
                <p className="text-xs text-slate-400">Nobody active right now.</p>
              ) : (
                <ul className="space-y-1">
                  {data.sessions.slice(0, 4).map((s) => (
                    <li key={s.id} className="flex items-start gap-1.5 text-xs leading-snug">
                      <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-500" />
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">{s.dev_label}</span>
                        <span className="text-slate-400"> · {s.repo} · {timeAgo(s.last_seen)}</span>
                        {s.summary && <span className="block truncate text-brand-600">{s.summary}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="card min-h-0 flex-1 overflow-hidden px-2.5 py-2">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">To-dos</span>
                <button onClick={() => setTab("Tasks")} className="text-[10px] text-slate-400 hover:text-brand-600">
                  all ({open.length})
                </button>
              </div>
              {open.length === 0 ? (
                <p className="text-xs text-slate-400">Nothing open. Nice.</p>
              ) : (
                <ul className="space-y-1.5">
                  {open.slice(0, 7).map((t) => <TaskRow key={t.id} t={t} compact />)}
                </ul>
              )}
            </div>

            <div className="flex flex-shrink-0 gap-1.5 text-center">
              {[
                { label: "PRs", value: data.prs.length, warn: false, go: "PRs" as Tab },
                { label: "Conflicts", value: data.conflicted, warn: data.conflicted > 0, go: "PRs" as Tab },
                { label: "Collisions", value: data.collisions.length, warn: data.collisions.length > 0, go: "Home" as Tab },
              ].map((s) => (
                <button key={s.label} onClick={() => setTab(s.go)} className="card flex-1 px-2 py-1 hover:border-brand-300">
                  <span className={"block text-base font-semibold tabular-nums " + (s.warn ? "text-red-600" : "text-slate-900")}>
                    {s.value}
                  </span>
                  <span className="block text-[9px] font-medium uppercase tracking-wide text-slate-400">{s.label}</span>
                </button>
              ))}
            </div>
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

      {/* Bottom tab bar — icons only; the active tab takes the accent colour
          and a soft tint pill. Labels stay as aria-label/title. */}
      <div className="flex flex-shrink-0 items-stretch border-t border-slate-200 bg-white px-1 py-1.5">
        {TABS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              aria-label={t}
              aria-current={active ? "page" : undefined}
              className="group relative flex flex-1 items-center justify-center py-1"
            >
              <span
                className={
                  "flex h-8 w-11 items-center justify-center rounded-lg transition-colors " +
                  (active ? "bg-brand-50 text-brand-600" : "text-slate-400 group-hover:bg-slate-50 group-hover:text-slate-600")
                }
              >
                <TabIcon tab={t} active={active} />
              </span>
              {/* Delayed label: appears after a deliberate hover (1.2s), gone
                  instantly on leave — no native title tooltip. */}
              <span
                aria-hidden
                className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium text-white opacity-0 shadow transition-opacity duration-150 group-hover:opacity-100 group-hover:[transition-delay:1200ms]"
              >
                {t}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
