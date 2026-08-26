import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AppNav } from "@/components/AppNav";
import { PrBadges } from "@/components/PrBadges";
import { computeMergePlan } from "@/lib/merge-order";
import { supabaseServer } from "@/lib/supabase/server";
import { computeLights } from "@/lib/traffic";
import { createClaim, releaseClaim } from "./claim-actions";
import { leaveHandoff, pickupHandoff, sendBroadcast } from "./handoff-actions";
import { Live } from "./live";
import { completeTask } from "./tasks/actions";

const LIGHT_CHIP: Record<string, { dot: string; cls: string; label: string }> = {
  green: { dot: "bg-emerald-500", cls: "bg-emerald-50 text-emerald-700", label: "Cleared to land" },
  yellow: { dot: "bg-amber-400", cls: "bg-amber-50 text-amber-700", label: "Hold" },
  red: { dot: "bg-red-500", cls: "bg-red-50 text-red-700", label: "Needs work" },
  gray: { dot: "bg-slate-300", cls: "bg-slate-100 text-slate-500", label: "Draft" },
};

const VERDICT_CHIP: Record<string, { label: string; cls: string }> = {
  looks_good: { label: "AI review: looks good", cls: "bg-emerald-50 text-emerald-700" },
  caution: { label: "AI review: caution", cls: "bg-amber-50 text-amber-700" },
  risky: { label: "AI review: risky", cls: "bg-red-50 text-red-700" },
};

const PRIORITY_CHIP: Record<number, string> = {
  1: "bg-red-50 text-red-700",
  2: "bg-amber-50 text-amber-700",
  3: "bg-brand-50 text-brand-700",
  4: "bg-slate-100 text-slate-600",
};

export const dynamic = "force-dynamic";

// Repo detail — live sessions, PRs, branches, activity, restore points.
// All reads go through the user's own Supabase session (RLS-scoped).

export default async function RepoPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id, full_name, default_branch, is_vault")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: prs }, { data: branches }, { data: activity }, { data: restores }, { data: liveSessions }, { data: tasks }, { data: handoffs }, { data: activeClaims }] =
    await Promise.all([
      supabase
        .from("prs")
        .select("number, title, author, head_branch, head_sha, state, review_state, draft, changed_files, mergeable_state, html_url, updated_at")
        .eq("repo_id", repo.id)
        .eq("state", "open")
        .order("updated_at", { ascending: false }),
      supabase
        .from("branches")
        .select("name, head_sha, changed_files, last_push_at, merged_at, stale_note")
        .eq("repo_id", repo.id)
        .or(`merged_at.is.null,merged_at.gte.${new Date(Date.now() - 48 * 3600_000).toISOString()}`)
        .order("last_push_at", { ascending: false })
        .limit(15),
      supabase
        .from("activity")
        .select("session_id, dev_label, label, branch, file, tool, at")
        .eq("repo_id", repo.id)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(200),
      supabase
        .from("restore_points")
        .select("tag, sha, environment, created_at")
        .eq("repo_id", repo.id)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("sessions")
        .select("id, dev_label, branch, summary, agent_kind, last_seen")
        .eq("repo_id", repo.id)
        .is("ended_at", null)
        .gte("last_seen", activeSince)
        .order("last_seen", { ascending: false }),
      supabase
        .from("tasks")
        .select("id, title, priority, tags, status, assigned_to, done_by, done_at, created_at")
        .eq("repo_id", repo.id)
        .order("priority")
        .order("created_at"),
      supabase
        .from("handoffs")
        .select("id, dev_label, branch, summary, done, remaining, warnings, created_at")
        .eq("repo_id", repo.id)
        .is("picked_up_at", null)
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("claims")
        .select("id, dev_label, paths, note, expires_at")
        .eq("repo_id", repo.id)
        .is("released_at", null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  // Agent-tier reads: latest AI review per open PR + the newest standup digest.
  const [{ data: reviews }, { data: digestRows }, { data: journals }] = await Promise.all([
    supabase
      .from("pr_reviews")
      .select("pr_number, head_sha, verdict, summary, points, created_at")
      .eq("repo_id", repo.id)
      .order("created_at", { ascending: false })
      .limit(60),
    supabase
      .from("digests")
      .select("day, body, model")
      .eq("repo_id", repo.id)
      .order("day", { ascending: false })
      .limit(1),
    supabase
      .from("journals")
      .select("id, dev_label, branch, summary, learned, decisions, tried_and_failed, remaining, files, dirty, at")
      .eq("repo_id", repo.id)
      .order("at", { ascending: false })
      .limit(8),
  ]);
  const reviewFor = new Map<string, NonNullable<typeof reviews>[number]>();
  for (const r of reviews ?? []) {
    const key = `${r.pr_number}:${r.head_sha}`;
    if (!reviewFor.has(key)) reviewFor.set(key, r);
  }
  const digest = (digestRows ?? [])[0] ?? null;

  // Merge-order intelligence + traffic lights — deterministic, computed live
  // from webhook-fresh data (the stored prs.light can lag one tick).
  const lightPrs = (prs ?? []).map((p) => ({
    number: p.number,
    title: p.title,
    author: p.author,
    review_state: p.review_state,
    mergeable_state: p.mergeable_state,
    draft: p.draft,
    changed_files: (p.changed_files as string[]) ?? [],
  }));
  const mergePlan = computeMergePlan(lightPrs);
  const lights = computeLights(lightPrs);

  const openTasks = (tasks ?? []).filter((t) => t.status === "open");
  const doneTasks = (tasks ?? [])
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""))
    .slice(0, 6);

  // Group each live session's recently-touched files.
  const { data: recentActivity } = await supabase
    .from("activity")
    .select("session_id, file, at")
    .eq("repo_id", repo.id)
    .gte("at", activeSince)
    .order("at", { ascending: false })
    .limit(200);
  const filesBySession = new Map<string, string[]>();
  for (const a of recentActivity ?? []) {
    const key = String(a.session_id ?? "");
    if (!filesBySession.has(key)) filesBySession.set(key, []);
    const list = filesBySession.get(key)!;
    if (!list.includes(a.file) && list.length < 8) list.push(a.file);
  }

  // Cross-branch collision detection on changed files (unmerged branches only).
  const fileBranches = new Map<string, string[]>();
  for (const b of branches ?? []) {
    if (b.merged_at) continue;
    for (const f of (b.changed_files as string[]) ?? []) {
      if (!fileBranches.has(f)) fileBranches.set(f, []);
      fileBranches.get(f)!.push(b.name);
    }
  }
  const collisions = [...fileBranches.entries()].filter(([, bs]) => bs.length > 1);

  const openBranches = (branches ?? []).filter((b) => !b.merged_at);
  const conflictedPrs = (prs ?? []).filter((p) => p.mergeable_state === "dirty").length;
  const stats = [
    { label: "Working now", value: liveSessions?.length ?? 0, accent: (liveSessions?.length ?? 0) > 0 },
    { label: "Open PRs", value: prs?.length ?? 0 },
    { label: "PR conflicts", value: conflictedPrs, warn: conflictedPrs > 0 },
    { label: "Active branches", value: openBranches.length },
    { label: "File collisions", value: collisions.length, warn: collisions.length > 0 },
  ];

  return (
    <>
      <AppNav
        live={<Live repoId={repo.id} />}
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}`, active: true },
          { label: "Tasks", href: `/dashboard/${repo.id}/tasks` },
          { label: "Specs", href: `/dashboard/${repo.id}/specs` },
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
          { label: "History", href: `/dashboard/${repo.id}/history` },
          { label: "Rules", href: `/dashboard/${repo.id}/rules` },
        ]}
      />
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-4 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{repo.full_name}</h1>
          <span className="text-sm text-slate-500">default branch: {repo.default_branch}</span>
        </div>

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="card card-pad">
              <div className="card-title">{s.label}</div>
              <div
                className={
                  "mt-1 text-2xl font-semibold tabular-nums " +
                  ("warn" in s && s.warn
                    ? "text-red-600"
                    : "accent" in s && s.accent
                      ? "text-emerald-600"
                      : "text-slate-900")
                }
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {collisions.length > 0 && (
          <div className="card mb-6 border-l-4 border-l-amber-400 card-pad">
            <div className="card-title mb-2 text-amber-700">Potential collisions</div>
            <ul className="space-y-1 text-sm text-slate-700">
              {collisions.map(([file, bs]) => (
                <li key={file}>
                  <code className="rounded bg-amber-50 px-1 text-amber-800">{file}</code> is modified on{" "}
                  {bs.join(" and ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Main column */}
          <div className="col-span-12 space-y-6 lg:col-span-8">
            {digest && (
              <section className="card card-pad border-l-4 border-l-brand-400">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="card-title">Standup digest</h2>
                  <span className="text-xs text-slate-400">
                    {digest.day} · written by DevBrain{digest.model && digest.model !== "none" ? ` (${digest.model})` : ""}
                  </span>
                </div>
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{digest.body}</p>
              </section>
            )}

            {journals && journals.length > 0 && (
              <section className="card card-pad">
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="card-title">Session journals</h2>
                  <span className="text-xs text-slate-400">what each session learned · visible to the whole team</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {journals.map((j) => {
                    const learned = (j.learned as string[]) ?? [];
                    const decisions = (j.decisions as string[]) ?? [];
                    const failed = (j.tried_and_failed as string[]) ?? [];
                    const files = (j.files as string[]) ?? [];
                    return (
                      <li key={j.id} className="py-3 first:pt-0 last:pb-0">
                        <div className="mb-1 flex flex-wrap items-baseline gap-x-2 text-xs text-slate-500">
                          <span className="font-semibold text-slate-800">{j.dev_label}</span>
                          {j.branch && <span className="font-mono">{j.branch}</span>}
                          <span>{new Date(j.at).toLocaleString()}</span>
                          {j.dirty && <span className="chip bg-amber-50 text-amber-700">ended with uncommitted changes</span>}
                        </div>
                        <p className="text-sm leading-relaxed text-slate-700">{j.summary}</p>
                        {(learned.length + decisions.length + failed.length > 0 || j.remaining) && (
                          <details className="mt-1.5">
                            <summary className="cursor-pointer text-xs text-brand-700">
                              {[learned.length && `${learned.length} learned`, decisions.length && `${decisions.length} decisions`, failed.length && `${failed.length} didn't work`, j.remaining && "remaining"].filter(Boolean).join(" · ")}
                            </summary>
                            <ul className="mt-1.5 space-y-1 pl-4 text-xs text-slate-600">
                              {learned.map((l, i) => <li key={"l" + i} className="list-disc"><span className="font-medium">learned:</span> {l}</li>)}
                              {decisions.map((l, i) => <li key={"d" + i} className="list-disc"><span className="font-medium">decided:</span> {l}</li>)}
                              {failed.map((l, i) => <li key={"f" + i} className="list-disc"><span className="font-medium">didn&apos;t work:</span> {l}</li>)}
                              {j.remaining && <li className="list-disc"><span className="font-medium">remaining:</span> {j.remaining}</li>}
                              {files.length > 0 && <li className="list-none pt-1 font-mono text-[11px] text-slate-400">{files.join("  ")}</li>}
                            </ul>
                          </details>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            <section className="card card-pad">
              <h2 className="card-title mb-3">Now working</h2>
              {!liveSessions || liveSessions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Nobody is in an active session on this repo right now. Sessions
                  appear here the moment anyone&apos;s Claude Code starts working.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {liveSessions.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-slate-900">{s.dev_label}</span>
                          <span className="text-xs text-slate-500">
                            {s.agent_kind}
                            {s.branch ? ` · ${s.branch}` : ""}
                          </span>
                        </div>
                        {s.summary && <div className="text-sm text-brand-600">{s.summary}</div>}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(filesBySession.get(String(s.id)) ?? []).map((f) => (
                            <code key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                              {f}
                            </code>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="card-title">Tasks</h2>
                <Link href={`/dashboard/${repo.id}/tasks`} className="text-xs text-slate-400 hover:text-brand-600">
                  Manage
                </Link>
              </div>
              {openTasks.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No open tasks. Add them on the{" "}
                  <Link href={`/dashboard/${repo.id}/tasks`} className="text-brand-600 hover:underline">Tasks tab</Link>.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {openTasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                      <form action={completeTask}>
                        <input type="hidden" name="repoId" value={repo.id} />
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          title="Mark complete"
                          className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
                          style={{ height: 16, width: 16 }}
                        />
                      </form>
                      <span className={`chip flex-shrink-0 ${PRIORITY_CHIP[t.priority] ?? PRIORITY_CHIP[4]}`}>
                        P{t.priority}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{t.title}</span>
                      {t.assigned_to && (
                        <span className="chip flex-shrink-0 bg-brand-50 text-brand-700">→ {t.assigned_to}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {doneTasks.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Completed
                  </div>
                  <ul className="space-y-1">
                    {doneTasks.map((t) => (
                      <li key={t.id} className="flex items-baseline gap-2 text-sm">
                        <span className="text-emerald-600">✓</span>
                        <span className="min-w-0 truncate text-slate-400 line-through">{t.title}</span>
                        <span className="flex-shrink-0 text-xs text-slate-400">{t.done_by}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            {mergePlan && mergePlan.order.length > 0 && (
              <section className="card card-pad border-l-4 border-l-amber-400">
                <h2 className="card-title mb-1">Suggested merge order</h2>
                <p className="mb-3 text-xs text-slate-500">
                  These PRs touch some of the same files. Merging in this order
                  keeps each rebase as small as possible.
                </p>
                <ol className="space-y-2">
                  {mergePlan.order.map((step, i) => (
                    <li key={step.number} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium text-slate-900">
                          #{step.number} {step.title}
                        </span>
                        <span className="block text-xs text-slate-500">{step.reason}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                {mergePlan.overlaps.length > 0 && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    {mergePlan.overlaps.map((o) => (
                      <div key={`${o.a}-${o.b}`} className="text-xs text-slate-500">
                        <span className="font-medium text-slate-700">#{o.a} ↔ #{o.b}</span> share{" "}
                        {o.files.map((f) => (
                          <code key={f} className="mr-1 rounded bg-slate-100 px-1 py-0.5 text-[11px] text-slate-600">{f}</code>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="card card-pad">
              <h2 className="card-title mb-3">Open pull requests</h2>
              {!prs || prs.length === 0 ? (
                <p className="text-sm text-slate-500">
                  None yet. Open a PR in this repo and it appears here via webhook.
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {prs.map((pr) => (
                    <li key={pr.number} className="py-2.5 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-center gap-x-2">
                        <a
                          href={pr.html_url ?? "#"}
                          target="_blank"
                          className="font-medium text-slate-900 hover:text-brand-600"
                        >
                          <span className="text-slate-400">#{pr.number}</span> {pr.title}
                        </a>
                        <PrBadges pr={pr} defaultBranch={repo.default_branch} />
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {pr.author} · {pr.head_branch}
                        {pr.draft ? " · draft" : ""}
                        {pr.review_state ? ` · ${pr.review_state}` : ""} ·{" "}
                        {((pr.changed_files as string[]) ?? []).length} files
                      </div>
                      {(() => {
                        const lt = lights.get(pr.number);
                        if (!lt) return null;
                        const chip = LIGHT_CHIP[lt.state];
                        return (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className={`chip inline-flex items-center gap-1.5 ${chip.cls}`}>
                              <span className={`inline-block h-2 w-2 rounded-full ${chip.dot}`} />
                              {chip.label}
                            </span>
                            <span className="text-xs text-slate-500">{lt.reason}</span>
                          </div>
                        );
                      })()}
                      {(() => {
                        const rv = pr.head_sha ? reviewFor.get(`${pr.number}:${pr.head_sha}`) : undefined;
                        if (!rv) return null;
                        const chip = VERDICT_CHIP[rv.verdict] ?? VERDICT_CHIP.caution;
                        const pts = (rv.points as { kind: string; text: string }[]) ?? [];
                        return (
                          <div className="mt-1.5 rounded-md border border-slate-100 bg-slate-50 px-2.5 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`chip ${chip.cls}`}>{chip.label}</span>
                              <span className="text-xs text-slate-600">{rv.summary}</span>
                            </div>
                            {pts.length > 0 && (
                              <ul className="mt-1.5 space-y-1">
                                {pts.map((p, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs leading-snug text-slate-600">
                                    <span
                                      className={
                                        "chip mt-px flex-shrink-0 px-1 py-0 text-[10px] " +
                                        (p.kind === "risk"
                                          ? "bg-red-50 text-red-700"
                                          : p.kind === "brain"
                                            ? "bg-brand-50 text-brand-700"
                                            : "bg-slate-100 text-slate-500")
                                      }
                                    >
                                      {p.kind}
                                    </span>
                                    {p.text}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })()}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <h2 className="card-title mb-3">Activity (24h)</h2>
              {!activity || activity.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No agent/editor activity reported yet. Run{" "}
                  <code className="rounded bg-slate-100 px-1">devbrain init</code> on a
                  dev machine to start streaming presence.
                </p>
              ) : (
                <ActivityFeed rows={activity} limit={14} />
              )}
            </section>
          </div>

          {/* Rail */}
          <div className="col-span-12 space-y-6 lg:col-span-4">
            {/* Manual presence — for teammates coding outside Claude Code
                (Cowork, an IDE). A claim made here reaches every plugin-
                connected Claude's context and pre-edit guard. */}
            <section className="card card-pad">
              <h2 className="card-title mb-1">I&apos;m working on…</h2>
              <p className="mb-3 text-xs leading-relaxed text-slate-500">
                Coding outside Claude Code? Claim your area — teammates&apos;
                Claudes will see it and route around you.
              </p>
              <form action={createClaim} className="space-y-2">
                <input type="hidden" name="repoId" value={repo.id} />
                <input
                  name="paths"
                  required
                  placeholder="Paths, comma-separated (e.g. src/auth/, README.md)"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
                <input
                  name="note"
                  placeholder="What you're doing (shown to the team)"
                  className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                />
                <div className="flex items-center gap-2">
                  <select name="hours" defaultValue="4" className="rounded-md border border-slate-200 px-2 py-1.5 text-xs">
                    <option value="1">1 hour</option>
                    <option value="2">2 hours</option>
                    <option value="4">4 hours</option>
                    <option value="8">8 hours</option>
                    <option value="24">24 hours</option>
                  </select>
                  <button className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                    Claim it
                  </button>
                </div>
              </form>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-brand-600">
                  Stopping mid-task? Leave a handoff
                </summary>
                <form action={leaveHandoff} className="mt-2 space-y-2">
                  <input type="hidden" name="repoId" value={repo.id} />
                  <input
                    name="summary"
                    required
                    placeholder="What the work is (required)"
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  />
                  <input
                    name="remaining"
                    placeholder="What's left to do"
                    className="w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  />
                  <div className="flex items-center gap-2">
                    <input
                      name="branch"
                      placeholder="Branch (optional)"
                      className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                    />
                    <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600">
                      Leave it
                    </button>
                  </div>
                </form>
              </details>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-brand-600">
                  Tell the team something
                </summary>
                <form action={sendBroadcast} className="mt-2 flex items-center gap-2">
                  <input type="hidden" name="repoId" value={repo.id} />
                  <input
                    name="text"
                    required
                    placeholder="Broadcast — every Claude and the feed see it"
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:border-brand-500 focus:outline-none"
                  />
                  <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-brand-500 hover:text-brand-600">
                    Send
                  </button>
                </form>
              </details>
            </section>

            {(activeClaims?.length ?? 0) > 0 && (
              <section className="card card-pad">
                <h2 className="card-title mb-3">Claimed areas</h2>
                <ul className="space-y-3">
                  {(activeClaims ?? []).map((c) => (
                    <li key={c.id} className="text-sm">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-medium text-slate-900">{c.dev_label}</span>
                        {c.note && <span className="text-xs text-slate-500">{c.note}</span>}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {((c.paths as string[]) ?? []).map((pth) => (
                          <code key={pth} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{pth}</code>
                        ))}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                        {c.expires_at && (
                          <span>
                            expires in {Math.max(1, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 3600_000))}h
                          </span>
                        )}
                        <form action={releaseClaim}>
                          <input type="hidden" name="repoId" value={repo.id} />
                          <input type="hidden" name="id" value={c.id} />
                          <button className="text-slate-400 hover:text-brand-600">Release</button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {(handoffs?.length ?? 0) > 0 && (
              <section className="card border-l-4 border-l-brand-400 card-pad">
                <h2 className="card-title mb-3">Open handoffs — unfinished work</h2>
                <ul className="space-y-3">
                  {(handoffs ?? []).map((h) => (
                    <li key={h.id} className="text-sm">
                      <div className="font-medium text-slate-900">{h.summary}</div>
                      <div className="text-xs text-slate-500">
                        left by {h.dev_label}
                        {h.branch ? ` on ${h.branch}` : ""} ·{" "}
                        {Math.max(1, Math.round((Date.now() - new Date(h.created_at).getTime()) / 3600_000))}h ago
                      </div>
                      {h.remaining && (
                        <div className="mt-0.5 text-xs text-slate-600">
                          <span className="font-medium text-slate-500">Left: </span>
                          {h.remaining}
                        </div>
                      )}
                      {h.warnings && (
                        <div className="mt-0.5 text-xs text-amber-700">
                          <span className="font-medium">Watch out: </span>
                          {h.warnings}
                        </div>
                      )}
                      <form action={pickupHandoff} className="mt-1">
                        <input type="hidden" name="repoId" value={repo.id} />
                        <input type="hidden" name="id" value={h.id} />
                        <button className="rounded-md border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:border-brand-500 hover:text-brand-600">
                          I&apos;m taking this
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card card-pad">
              <h2 className="card-title mb-3">Branches</h2>
              {!branches || branches.length === 0 ? (
                <p className="text-sm text-slate-500">No pushes seen yet. Push any branch to populate.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {branches.map((b) => (
                    <li key={b.name} className="flex flex-wrap items-baseline gap-x-2">
                      <span className={b.merged_at ? "text-slate-400" : "font-medium text-slate-800"}>
                        {b.name}
                      </span>
                      {b.merged_at ? (
                        <span className="chip bg-violet-50 text-violet-700">
                          merged {Math.max(1, Math.round((Date.now() - new Date(b.merged_at).getTime()) / 3600_000))}h ago · removes at 48h
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">
                          {((b.changed_files as string[]) ?? []).length} changed vs {repo.default_branch}
                        </span>
                      )}
                      {!b.merged_at && b.stale_note && (
                        <span className="basis-full text-xs text-amber-700">{b.stale_note}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="card-title">Restore points</h2>
                <Link href={`/dashboard/${repo.id}/history`} className="text-xs text-slate-400 hover:text-brand-600">
                  Full history
                </Link>
              </div>
              {!restores || restores.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No deploy-tagged points yet — but every push and merge is on the{" "}
                  <Link href={`/dashboard/${repo.id}/history`} className="text-brand-600 hover:underline">History tab</Link>{" "}
                  with rollback recipes.
                </p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {restores.map((r, i) => (
                    <li key={i} className="text-slate-700">
                      <code className="rounded bg-slate-100 px-1 text-xs">{r.tag ?? r.sha.slice(0, 7)}</code>
                      <span className="ml-2 text-xs text-slate-500">
                        {r.environment} · {new Date(r.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
