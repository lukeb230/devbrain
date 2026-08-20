import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseAdmin } from "@/lib/supabase/server";
import { revertFromHistory } from "./actions";
import { supabaseServer } from "@/lib/supabase/server";
import { Live } from "../live";

export const dynamic = "force-dynamic";

// History — the rollback timeline. One stream built from three sources:
// pushes to main (recorded by webhook), merged PRs, and deploy-tagged
// restore points. Every entry expands into an exact rollback recipe.
// DevBrain is read-only by design, so rollbacks run through the dev's own
// git (or their Claude) — the recipes are copy-paste ready.

type Entry = {
  at: string;
  kind: "push" | "merge" | "restore_point";
  title: string;
  sha: string | null;
  before: string | null; // range start — enables one-click revert on pushes
  meta: string;
  files: string[];
  prNumber?: number;
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

const KIND_CHIP: Record<Entry["kind"], { label: string; cls: string }> = {
  push: { label: "push", cls: "bg-slate-100 text-slate-600" },
  merge: { label: "merge", cls: "bg-violet-50 text-violet-700" },
  restore_point: { label: "restore point", cls: "bg-emerald-50 text-emerald-700" },
};

export default async function HistoryPage({
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
    .select("id, full_name, default_branch, writer_installation_id")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  // Writer (Direction 2): one-click revert is live only when the writer app
  // is connected AND the repo's writer_revert_pr policy is on.
  let revertEnabled = false;
  if (repo.writer_installation_id) {
    const { data: policy } = await supabaseAdmin()
      .from("policies")
      .select("enabled")
      .eq("repo_id", repo.id)
      .eq("rule", "writer_revert_pr")
      .single();
    revertEnabled = Boolean(policy?.enabled);
  }

  const [{ data: pushes }, { data: mergedBranches }, { data: prs }, { data: restores }] =
    await Promise.all([
      supabase
        .from("events")
        .select("payload, at")
        .eq("repo_id", repo.id)
        .eq("kind", "main_push")
        .order("at", { ascending: false })
        .limit(60),
      supabase
        .from("branches")
        .select("name, head_sha, changed_files, merged_at")
        .eq("repo_id", repo.id)
        .not("merged_at", "is", null)
        .order("merged_at", { ascending: false })
        .limit(30),
      supabase
        .from("prs")
        .select("number, title, author, head_branch, state")
        .eq("repo_id", repo.id)
        .neq("state", "open"),
      supabase
        .from("restore_points")
        .select("tag, sha, environment, created_at")
        .eq("repo_id", repo.id)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);

  const prByBranch = new Map((prs ?? []).map((p) => [p.head_branch, p]));
  const entries: Entry[] = [];

  for (const e of pushes ?? []) {
    const p = e.payload as {
      sha?: string; before?: string; message?: string; pusher?: string; commit_count?: number; files?: string[];
    };
    entries.push({
      at: e.at,
      kind: "push",
      title: p.message || "(no commit message)",
      sha: p.sha ?? null,
      before: p.before ?? null,
      meta: `${p.pusher ?? "?"} · ${p.commit_count ?? 1} commit${(p.commit_count ?? 1) === 1 ? "" : "s"} to ${repo.default_branch}`,
      files: p.files ?? [],
    });
  }
  for (const b of mergedBranches ?? []) {
    const pr = prByBranch.get(b.name);
    entries.push({
      at: b.merged_at as string,
      kind: "merge",
      title: pr ? `#${pr.number} ${pr.title}` : `Merged branch ${b.name}`,
      sha: b.head_sha,
      before: null,
      meta: `${pr?.author ?? "?"} · ${b.name} → ${repo.default_branch}`,
      files: ((b.changed_files as string[]) ?? []).slice(0, 40),
      prNumber: pr?.number,
    });
  }
  for (const r of restores ?? []) {
    entries.push({
      at: r.created_at,
      kind: "restore_point",
      title: r.tag ?? r.sha.slice(0, 7),
      sha: r.sha,
      before: null,
      meta: `deploy · ${r.environment}`,
      files: [],
    });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));

  return (
    <>
      <AppNav
        live={<Live repoId={repo.id} />}
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}` },
          { label: "Tasks", href: `/dashboard/${repo.id}/tasks` },
          { label: "Specs", href: `/dashboard/${repo.id}/specs` },
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
          { label: "History", href: `/dashboard/${repo.id}/history`, active: true },
          { label: "Rules", href: `/dashboard/${repo.id}/rules` },
        ]}
      />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-1 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">History</h1>
          <span className="text-sm text-slate-500">{repo.full_name}</span>
        </div>
        <p className="mb-5 max-w-2xl text-sm text-slate-500">
          Every change to {repo.default_branch}, newest first. Expand any entry
          for a copy-paste rollback recipe — DevBrain never touches your code,
          so restores run through your own git (or your Claude).
        </p>

        {entries.length === 0 ? (
          <section className="card card-pad">
            <p className="text-sm text-slate-500">
              No history yet. Pushes to {repo.default_branch} and merged PRs
              land here automatically; deploy scripts can add tagged restore
              points via <code className="rounded bg-slate-100 px-1">POST /api/v1/restore-points</code>.
            </p>
          </section>
        ) : (
          <section className="card">
            <ul className="divide-y divide-slate-100">
              {entries.map((e, i) => {
                const chip = KIND_CHIP[e.kind];
                const short = e.sha ? e.sha.slice(0, 7) : null;
                return (
                  <li key={i}>
                    <details className="group">
                      <summary className="flex cursor-pointer list-none items-baseline gap-2.5 px-4 py-2.5 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                        <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▸</span>
                        <span className={`chip flex-shrink-0 ${chip.cls}`}>{chip.label}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                          {e.title}
                        </span>
                        {short && (
                          <code className="flex-shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                            {short}
                          </code>
                        )}
                        <span className="flex-shrink-0 text-xs text-slate-400">{timeAgo(e.at)}</span>
                      </summary>
                      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
                        <div className="mb-2 text-xs text-slate-500">
                          {e.meta} · {new Date(e.at).toLocaleString()}
                        </div>
                        {e.files.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
                            {e.files.slice(0, 14).map((f) => (
                              <code key={f} className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-600 ring-1 ring-slate-200">
                                {f}
                              </code>
                            ))}
                            {e.files.length > 14 && (
                              <span className="text-xs text-slate-400">+{e.files.length - 14} more</span>
                            )}
                          </div>
                        )}
                        {e.sha && (
                          <div className="space-y-2">
                            {revertEnabled && e.before && (
                              <form action={revertFromHistory}>
                                <input type="hidden" name="repoId" value={repo.id} />
                                <input type="hidden" name="sha" value={e.sha} />
                                <input type="hidden" name="before" value={e.before} />
                                <input type="hidden" name="label" value={e.title} />
                                <button className="rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700">
                                  Create revert PR
                                </button>
                                <span className="ml-2 text-xs text-slate-400">
                                  opens a PR restoring the files this change touched — a teammate reviews it
                                </span>
                              </form>
                            )}
                            <div>
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Inspect this point in time
                              </div>
                              <code className="block select-all rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                                git fetch origin && git checkout -b inspect-{short} {e.sha}
                              </code>
                            </div>
                            <div>
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                {e.kind === "merge" ? "Undo this merge (safe — via a new PR)" : "Undo this change (safe — via a new PR)"}
                              </div>
                              <code className="block select-all rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                                git checkout -b revert-{short} origin/{repo.default_branch} && git revert {e.kind === "merge" ? "-m 1 " : ""}{e.sha} && git push -u origin revert-{short}
                              </code>
                              <p className="mt-1 text-xs text-slate-400">
                                Then open a PR from <code>revert-{short}</code> — a teammate reviews, same as any change.
                              </p>
                            </div>
                            <div>
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Or just tell your Claude
                              </div>
                              <code className="block select-all rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700">
                                Roll {repo.default_branch} back past {short} ({e.title.replace(/"/g, "'").slice(0, 60)}) — make the revert branch and PR for me.
                              </code>
                            </div>
                          </div>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
