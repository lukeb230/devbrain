"use client";

// The widget mini-app: a Home tab that fits the panel with NO scrolling
// (tasks + who's working — the glance content), and a bottom tab bar for
// Tasks / PRs / Brain / Feed. Tab switches are instant (pure client state).

import { useState } from "react";
import { ActivityFeed, type ActivityRow } from "@/components/ActivityFeed";
import { PrBadges } from "@/components/PrBadges";
import { assignTask, completeTask, createTask, reopenTask } from "../dashboard/[repoId]/tasks/actions";
import { BrainExplorer, type NotePayload } from "../dashboard/[repoId]/brain/explorer";
import type { GEdge, GNode } from "../dashboard/[repoId]/brain/graph";
import { WidgetLive } from "./live";

export interface WidgetData {
  sessions: { id: string; repo: string; dev_label: string; summary: string | null; last_seen: string }[];
  collisions: { repo: string; file: string; branches: string[] }[];
  prs: { repo_id: string; repo: string; defaultBranch: string; number: number; title: string; author: string | null; review_state: string | null; draft: boolean; mergeable_state: string | null; html_url: string | null }[];
  tasks: { id: string; repo_id: string; repo: string; title: string; detail: string | null; priority: number; tags: string[]; assigned_to: string | null; status: string; done_by: string | null; created_by: string | null; created_at: string }[];
  members: string[];
  feed: { kind: string; text: string; by: string | null; at: string }[];
  activity: ActivityRow[];
  brain: { notes: NotePayload[]; nodes: GNode[]; edges: GEdge[]; repoId: string; repoName: string } | null;
  lastRepo: { id: string; name: string } | null;
  conflicted: number;
}

const TABS = ["Home", "Tasks", "PRs", "Brain", "Feed"] as const;
type Tab = (typeof TABS)[number];

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
    <li className="flex items-center gap-2">
      <form action={completeTask} className="flex-shrink-0">
        <input type="hidden" name="repoId" value={t.repo_id} />
        <input type="hidden" name="id" value={t.id} />
        <button
          title="Mark complete"
          className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
          style={{ height: 14, width: 14 }}
        />
      </form>
      <span className={`chip flex-shrink-0 px-1 py-0 text-[10px] ${PRIO[t.priority] ?? PRIO[4]}`}>P{t.priority}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-slate-800">{t.title}</span>
      {!compact && t.assigned_to && <span className="flex-shrink-0 text-[10px] text-brand-600">{t.assigned_to}</span>}
    </li>
  );
}

export function WidgetApp({ data }: { data: WidgetData }) {
  const [tab, setTab] = useState<Tab>("Home");
  const open = data.tasks.filter((t) => t.status === "open");
  const done = data.tasks.filter((t) => t.status === "done").slice(0, 5);

  return (
    <div className="flex h-screen flex-col bg-slate-50">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-[11px] font-bold text-white">D</span>
          <span className="text-sm font-semibold text-slate-900">DevBrain</span>
          <WidgetLive />
        </span>
        <a
          href={data.lastRepo ? `/dashboard/${data.lastRepo.id}` : "/dashboard"}
          target="_blank"
          className="text-[11px] text-slate-400 hover:text-brand-600"
        >
          Full dashboard
        </a>
      </div>

      {/* Content */}
      <div className={"min-h-0 flex-1 px-3 py-2.5 " + (tab === "Home" ? "overflow-hidden" : "overflow-y-auto")}>
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
                          <div className="flex items-center gap-2">
                            <form action={completeTask} className="flex-shrink-0">
                              <input type="hidden" name="repoId" value={t.repo_id} />
                              <input type="hidden" name="id" value={t.id} />
                              <button
                                title="Mark complete"
                                className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
                                style={{ height: 14, width: 14 }}
                              />
                            </form>
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.title}</span>
                          </div>
                          {t.detail && (
                            <div className="ml-6 truncate text-[10px] text-slate-500">{t.detail}</div>
                          )}
                          <div className="ml-6 mt-0.5 flex flex-wrap items-center gap-1">
                            {t.tags.map((tag) => (
                              <span key={tag} className="chip bg-slate-100 px-1 py-0 text-[10px] text-slate-500">{tag}</span>
                            ))}
                            <span className="text-[10px] text-slate-400">
                              {t.created_by} · {timeAgo(t.created_at)}
                            </span>
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
                  </li>
                ))}
              </ul>
            )}
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
              />
            </div>
          ) : (
            <p className="text-xs text-slate-400">Open a repo on the dashboard once and its brain shows here.</p>
          )
        )}

        {tab === "Feed" && (
          <div className="space-y-2.5">
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

      {/* Bottom tab bar */}
      <div className="flex flex-shrink-0 border-t border-slate-200 bg-white">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "flex-1 py-2 text-[11px] font-medium " +
              (tab === t ? "border-t-2 border-brand-600 text-brand-700" : "border-t-2 border-transparent text-slate-400 hover:text-slate-700")
            }
          >
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}
