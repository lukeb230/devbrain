import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PrBadges } from "@/components/PrBadges";
import { supabaseServer } from "@/lib/supabase/server";
import { Live } from "./live";

export const dynamic = "force-dynamic";

// Phase 0.5 — minimal repo detail page: open PRs, branches vs main,
// recent activity, restore points. All reads go through the user's own
// Supabase session, so RLS scopes everything to their org.

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
  const [{ data: prs }, { data: branches }, { data: activity }, { data: restores }, { data: liveSessions }] =
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
        .select("branch, file, tool, at")
        .eq("repo_id", repo.id)
        .gte("at", since)
        .order("at", { ascending: false })
        .limit(50),
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
    ]);

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

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
          ← All repositories
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="mt-2 text-2xl font-bold text-white">{repo.full_name}</h1>
          <span className="flex gap-2">
            <Link
              href={`/dashboard/${repo.id}/brain`}
              className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-brand-400 hover:text-brand-500"
            >
              🧠 Second Brain
            </Link>
            <Link
              href={`/dashboard/${repo.id}/rules`}
              className="rounded-lg bg-ink-800 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
            >
              Rules
            </Link>
          </span>
        </div>
        <p className="text-sm text-slate-500">
          default branch: {repo.default_branch} · <Live repoId={repo.id} />
        </p>
      </header>

      <section className="panel mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Now working</h2>
        {!liveSessions || liveSessions.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nobody is in an active session on this repo right now. Sessions
            appear here the moment anyone&apos;s Claude Code starts working.
          </p>
        ) : (
          <ul className="space-y-3">
            {liveSessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-400" />
                <div className="min-w-0">
                  <div className="font-medium text-slate-200">
                    {s.dev_label}
                    <span className="ml-2 text-xs text-slate-500">
                      {s.agent_kind}
                      {s.branch ? ` · ${s.branch}` : ""}
                    </span>
                  </div>
                  {s.summary && (
                    <div className="text-xs text-slate-400">{s.summary}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(filesBySession.get(String(s.id)) ?? []).map((f) => (
                      <code
                        key={f}
                        className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-brand-400"
                      >
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

      {collisions.length > 0 && (
        <section className="panel mb-6 border-amber-500/50">
          <h2 className="mb-2 text-sm font-semibold text-amber-400">
            ⚠ Potential collisions
          </h2>
          <ul className="space-y-1 text-sm text-slate-300">
            {collisions.map(([file, bs]) => (
              <li key={file}>
                <code className="text-amber-300">{file}</code> is modified on{" "}
                {bs.join(" and ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Open pull requests</h2>
        {!prs || prs.length === 0 ? (
          <p className="text-sm text-slate-500">
            None yet. Open a PR in this repo and it appears here via webhook.
          </p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {prs.map((pr) => (
              <li key={pr.number} className="py-3">
                <a
                  href={pr.html_url ?? "#"}
                  target="_blank"
                  className="font-medium text-brand-400 hover:text-brand-500"
                >
                  #{pr.number} {pr.title}
                </a>
                <PrBadges pr={pr} defaultBranch={repo.default_branch} />
                <div className="text-xs text-slate-500">
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

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel">
          <h2 className="mb-3 text-lg font-semibold text-white">Branches</h2>
          {!branches || branches.length === 0 ? (
            <p className="text-sm text-slate-500">
              No pushes seen yet. Push any branch to populate.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {branches.map((b) => (
                <li key={b.name}>
                  <span className={b.merged_at ? "text-slate-500" : "text-slate-200"}>
                    {b.name}
                  </span>
                  {b.merged_at ? (
                    <span className="ml-2 rounded bg-purple-500/15 px-1.5 py-0.5 text-xs text-purple-300">
                      merged {Math.max(1, Math.round((Date.now() - new Date(b.merged_at).getTime()) / 3600_000))}h ago
                      · auto-removes at 48h
                    </span>
                  ) : (
                    <span className="ml-2 text-xs text-slate-500">
                      {((b.changed_files as string[]) ?? []).length} changed vs{" "}
                      {repo.default_branch}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2 className="mb-3 text-lg font-semibold text-white">
            Activity (24h)
          </h2>
          {!activity || activity.length === 0 ? (
            <p className="text-sm text-slate-500">
              No agent/editor activity reported yet. Run{" "}
              <code className="rounded bg-ink-800 px-1">devbrain init</code> on a
              dev machine to start streaming presence.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {activity.slice(0, 15).map((a, i) => (
                <li key={i} className="truncate text-slate-300">
                  <code className="text-xs">{a.file}</code>
                  <span className="ml-1 text-xs text-slate-500">
                    {a.tool}
                    {a.branch ? ` · ${a.branch}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel mt-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Restore points</h2>
        {!restores || restores.length === 0 ? (
          <p className="text-sm text-slate-500">
            None recorded. POST to /api/v1/restore-points from a deploy script to
            create the rollback timeline.
          </p>
        ) : (
          <ul className="space-y-1 text-sm">
            {restores.map((r, i) => (
              <li key={i} className="text-slate-300">
                <code>{r.tag ?? r.sha.slice(0, 7)}</code>
                <span className="ml-2 text-xs text-slate-500">
                  {r.environment} · {new Date(r.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
