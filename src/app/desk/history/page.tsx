import { redirect } from "next/navigation";
import { revertFromHistory } from "@/app/dashboard/[repoId]/history/actions";
import { deskScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { canRevert } from "@/lib/writer-gates";
import { DeskNext } from "../desk-next";
import { RepoChooser } from "../repo-chooser";
import { Button, Card, Chip, Empty, PageTitle } from "../ui";

// ============================================================================
// Desk · History — every change to main, newest first: pushes, merged PRs,
// restore points. Each entry expands into an exact rollback recipe. With
// the repo's "Revert from History" switch on, Create revert PR opens the
// revert as a pull request on GitHub (the browser) — never a push to main.
// ============================================================================

export const dynamic = "force-dynamic";

type Entry = { at: string; kind: "push" | "merge" | "restore_point"; title: string; sha: string | null; before: string | null; meta: string; files: string[] };

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DeskHistory({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name, default_branch, installation_id").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) {
    return (
      <>
        <PageTitle title="History" sub="What landed on main, for one repo." />
        <RepoChooser repos={repos ?? []} route="/desk/history" what="history" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;

  const [{ data: revertPolicy }, { data: pushes }, { data: mergedBranches }, { data: prs }, { data: restores }] = await Promise.all([
    supabaseAdmin().from("policies").select("enabled").eq("repo_id", repo.id).eq("rule", "writer_revert_pr").maybeSingle(),
    supabase.from("events").select("payload, at").eq("repo_id", repo.id).eq("kind", "main_push").order("at", { ascending: false }).limit(60),
    supabase.from("branches").select("name, head_sha, changed_files, merged_at").eq("repo_id", repo.id).not("merged_at", "is", null).order("merged_at", { ascending: false }).limit(30),
    supabase.from("prs").select("number, title, author, head_branch, state").eq("repo_id", repo.id).neq("state", "open"),
    supabase.from("restore_points").select("tag, sha, environment, created_at").eq("repo_id", repo.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const revertEnabled = canRevert({ policyOn: revertPolicy?.enabled, installationId: repo.installation_id });
  const prByBranch = new Map((prs ?? []).map((p) => [p.head_branch, p]));
  const entries: Entry[] = [];
  for (const e of pushes ?? []) {
    const p = e.payload as { sha?: string; before?: string; message?: string; pusher?: string; commit_count?: number; files?: string[] };
    entries.push({ at: e.at, kind: "push", title: p.message || "(no commit message)", sha: p.sha ?? null, before: p.before ?? null, meta: `${p.pusher ?? "?"} · ${p.commit_count ?? 1} commit${(p.commit_count ?? 1) === 1 ? "" : "s"} to ${repo.default_branch}`, files: p.files ?? [] });
  }
  for (const b of mergedBranches ?? []) {
    const pr = prByBranch.get(b.name);
    entries.push({ at: b.merged_at as string, kind: "merge", title: pr ? `#${pr.number} ${pr.title}` : `Merged branch ${b.name}`, sha: b.head_sha, before: null, meta: `${pr?.author ?? "?"} · ${b.name} → ${repo.default_branch}`, files: ((b.changed_files as string[]) ?? []).slice(0, 40) });
  }
  for (const r of restores ?? []) {
    entries.push({ at: r.created_at, kind: "restore_point", title: r.tag ?? r.sha.slice(0, 7), sha: r.sha, before: null, meta: `restore point${r.environment ? ` · ${r.environment}` : ""}`, files: [] });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const restorePoints = entries.filter((e) => e.kind === "restore_point");
  const timeline = entries.filter((e) => e.kind !== "restore_point");

  const Recipe = ({ e }: { e: Entry }) => {
    const short = (e.sha ?? "").slice(0, 7);
    return (
      <div className="mt-2 space-y-2 text-[11.5px]">
        {revertEnabled && e.before && (
          <form action={revertFromHistory} className="flex items-center gap-2">
            <DeskNext /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="sha" value={e.sha ?? ""} /><input type="hidden" name="before" value={e.before} /><input type="hidden" name="label" value={e.title} />
            <Button>Create revert PR</Button><span className="text-faint">opens a PR on GitHub restoring the files this change touched — a teammate reviews it</span>
          </form>
        )}
        <div><div className="font-display text-[9.5px] uppercase tracking-[.14em] text-muted">Inspect this point in time</div><code className="mt-0.5 block select-all rounded-md border border-line2 bg-ink px-2 py-1 font-mono text-[10.5px] text-[var(--wg-code)]">git fetch origin && git checkout -b inspect-{short} {e.sha}</code></div>
        <div><div className="font-display text-[9.5px] uppercase tracking-[.14em] text-muted">{e.kind === "merge" ? "Undo this merge (safe — via a new PR)" : "Undo this change (safe — via a new PR)"}</div><code className="mt-0.5 block select-all rounded-md border border-line2 bg-ink px-2 py-1 font-mono text-[10.5px] text-[var(--wg-code)]">git checkout -b revert-{short} origin/{repo.default_branch} && git revert {e.kind === "merge" ? "-m 1 " : ""}{e.sha} && git push -u origin revert-{short}</code><div className="mt-0.5 text-faint">Then open a PR from revert-{short} — a teammate reviews, same as any change.</div></div>
        <div><div className="font-display text-[9.5px] uppercase tracking-[.14em] text-muted">Or just tell your Claude</div><code className="mt-0.5 block select-all rounded-md border border-line2 bg-ink px-2 py-1 font-mono text-[10.5px] text-[var(--wg-code)]">Roll {repo.default_branch} back past {short} ({e.title.replace(/"/g, "'").slice(0, 60)}) — make the revert branch and PR for me.</code></div>
      </div>
    );
  };

  return (
    <>
      <PageTitle title="History" sub={`${repo.full_name} · every change to ${repo.default_branch}, newest first · ${revertEnabled ? "Revert opens a pull request" : "turn on “Revert from History” under Rules to revert from here"}`} />
      <Card title={repo.default_branch} count={timeline.length}>
        {timeline.length === 0 ? <Empty>Nothing recorded yet — pushes to {repo.default_branch} and merged PRs appear here.</Empty> : timeline.map((e, i) => (
          <details key={`${e.kind}-${e.sha}-${i}`} className="border-t border-line py-1.5 first:border-t-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px]">
              <Chip tone={e.kind === "merge" ? "violet" : "muted"}>{e.kind}</Chip>
              <span className="min-w-0 flex-1 truncate text-txt">{e.title}</span>
              {e.sha && <span className="font-mono text-[10px] text-faint">{e.sha.slice(0, 7)}</span>}
              <span className="font-mono text-[10px] text-faint">{ago(e.at)}</span>
            </summary>
            <div className="mt-1 text-[10.5px] text-muted">{e.meta} · {new Date(e.at).toLocaleString()}</div>
            {e.files.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{e.files.slice(0, 14).map((f) => <Chip key={f}>{f}</Chip>)}{e.files.length > 14 && <span className="text-[10px] text-faint">+{e.files.length - 14} more</span>}</div>}
            {e.sha && <Recipe e={e} />}
          </details>
        ))}
      </Card>
      <Card title="Restore points" count={restorePoints.length} right="deploy scripts register these">
        {restorePoints.length === 0 ? <Empty>None registered. From any deploy script: <span className="font-mono">POST /api/v1/restore-points</span> with the sha or tag you just shipped.</Empty> : restorePoints.map((e, i) => (
          <details key={`rp-${i}`} className="border-t border-line py-1.5 first:border-t-0">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-[12.5px]"><Chip tone="code">restore point</Chip><span className="flex-1 text-txt">{e.title}</span><span className="font-mono text-[10px] text-faint">{e.meta} · {ago(e.at)}</span></summary>
            {e.sha && <Recipe e={e} />}
          </details>
        ))}
      </Card>
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
