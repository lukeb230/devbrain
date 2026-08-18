import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AppNav } from "@/components/AppNav";
import { PrBadges } from "@/components/PrBadges";
import { supabaseServer } from "@/lib/supabase/server";
import { releaseClaim } from "./claim-actions";
import { pickupHandoff } from "./handoff-actions";
import { Live } from "./live";
import { completeTask } from "./tasks/actions";

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
    .select("id, full_name, default_branch, is_vault")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: prs }, { data: branches }, { data: activity }, { data: restores }, { data: liveSessions }, { data: tasks }, { data: handoffs }, { data: activeClaims }] =
    await Promise.all([
      supabase
        .from("prs")
        .select("number, title, author, head_branch, state, review_state, draft, changed_files, mergeable_state, html_url, updated_at")
        .eq("repo_id", repo.id)
        .eq("state", "open")
        .order("updated_at", { ascending: false }),
      supabase
        .from("branches")
        .select("name, head_sha, changed_files, last_push_at, merged_at")
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
