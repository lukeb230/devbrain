import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

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
  const [{ data: prs }, { data: branches }, { data: activity }, { data: restores }] =
    await Promise.all([
      supabase
        .from("prs")
        .select("number, title, author, head_branch, state, review_state, draft, changed_files, html_url, updated_at")
        .eq("repo_id", repo.id)
        .eq("state", "open")
        .order("updated_at", { ascending: false }),
      supabase
        .from("branches")
        .select("name, head_sha, changed_files, last_push_at")
        .eq("repo_id", repo.id)
        .order("last_push_at", { ascending: false })
        .limit(10),
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
    ]);

  // Cross-branch collision detection on changed files.
  const fileBranches = new Map<string, string[]>();
  for (const b of branches ?? []) {
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
        <h1 className="mt-2 text-2xl font-bold text-white">{repo.full_name}</h1>
        <p className="text-sm text-slate-500">default branch: {repo.default_branch}</p>
      </header>

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
                  <span className="text-slate-200">{b.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {((b.changed_files as string[]) ?? []).length} changed vs{" "}
                    {repo.default_branch}
                  </span>
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
