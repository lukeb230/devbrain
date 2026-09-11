import { redirect } from "next/navigation";
import { revertFromHistory } from "@/app/dashboard/[repoId]/history/actions";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { currentUser, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { canRevert } from "@/lib/writer-gates";
import { DeskNext } from "../desk-next";
import { ListPane, ListRow, PaneEyebrow, Reading } from "../panes";
import { RepoChooser } from "../repo-chooser";
import { Button, CodeBlock, Empty, Eyebrow, Section } from "../ui";

// ============================================================================
// Desk · History (Dusk). List pane: every change to main newest first (merge /
// push with sha · who · ago) and the restore points. Reading pane: the
// selected entry (?sha=), its files, Create revert PR (when the repo's
// "Revert from History" switch is on — always a PR, never a push to main),
// and the three by-hand recipes.
// ============================================================================

export const dynamic = "force-dynamic";

type Entry = { at: string; kind: "push" | "merge" | "restore_point"; title: string; sha: string | null; before: string | null; who: string; branch: string | null; env: string | null; files: string[]; commits?: number };

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DeskHistory({ searchParams }: { searchParams: Promise<{ repo?: string; sha?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name, default_branch, installation_id").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) return <RepoChooser repos={repos ?? []} route="/desk/history" what="history" title="History" />;
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const base = withScope("/desk/history", scope);

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
    entries.push({ at: e.at, kind: "push", title: p.message || "(no commit message)", sha: p.sha ?? null, before: p.before ?? null, who: p.pusher ?? "?", branch: null, env: null, files: p.files ?? [], commits: p.commit_count ?? 1 });
  }
  for (const b of mergedBranches ?? []) {
    const pr = prByBranch.get(b.name);
    entries.push({ at: b.merged_at as string, kind: "merge", title: pr ? `#${pr.number} ${pr.title}` : `Merged branch ${b.name}`, sha: b.head_sha, before: null, who: pr?.author ?? "?", branch: b.name, env: null, files: ((b.changed_files as string[]) ?? []).slice(0, 40) });
  }
  for (const r of restores ?? []) {
    entries.push({ at: r.created_at, kind: "restore_point", title: r.tag ?? r.sha.slice(0, 7), sha: r.sha, before: null, who: "", branch: null, env: r.environment, files: [] });
  }
  entries.sort((a, b) => b.at.localeCompare(a.at));
  const restorePoints = entries.filter((e) => e.kind === "restore_point");
  const timeline = entries.filter((e) => e.kind !== "restore_point");
  const selected = (sp.sha ? entries.find((e) => e.sha === sp.sha) : null) ?? timeline[0] ?? restorePoints[0] ?? null;
  const short = (sha: string | null) => (sha ?? "").slice(0, 7);
  const href = (e: Entry) => `${base}${e.sha ? `&sha=${e.sha}` : ""}`;

  return (
    <>
      <ListPane title="History" count={repo.default_branch}>
        {timeline.length === 0 && <p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">Nothing recorded yet — pushes to {repo.default_branch} and merged PRs appear here.</p>}
        {timeline.map((e, i) => (
          <ListRow key={`${e.kind}-${e.sha}-${i}`} href={href(e)} selected={selected === e} pad="9px 10px">
            <div className="flex items-baseline gap-2">
              <span className={`font-mono text-[10px] ${e.kind === "merge" ? "text-violet" : "text-faint"}`}>{e.kind}</span>
              <span className={`min-w-0 flex-1 truncate text-[13px] ${selected === e ? "font-medium" : ""}`}>{e.title}</span>
            </div>
            <div className="mt-0.5 font-mono text-[10.5px] text-muted">{short(e.sha)} · {e.who} · {ago(e.at)}</div>
          </ListRow>
        ))}
        <PaneEyebrow className="pt-4">restore points · {restorePoints.length}</PaneEyebrow>
        {restorePoints.length === 0 && <p className="px-4 pb-3 text-[12px] leading-[1.5] text-faint">None registered. From any deploy script: <span className="font-mono">POST /api/v1/restore-points</span> with the sha or tag you just shipped.</p>}
        {restorePoints.map((e, i) => (
          <ListRow key={`rp-${i}`} href={href(e)} selected={selected === e} pad="9px 10px">
            <div className="flex justify-between text-[13px]"><span className="font-mono">{e.title}</span><span className="font-mono text-[10.5px] text-muted">{e.env ?? "restore point"} · {ago(e.at).replace(" ago", "")}</span></div>
          </ListRow>
        ))}
        <div className="pb-3" />
      </ListPane>

      <Reading>
        {!selected ? (
          <Empty>Nothing to show yet.</Empty>
        ) : (
          <>
            <div className={`font-mono text-[11px] uppercase tracking-[.1em] ${selected.kind === "merge" ? "text-violet" : "text-faint"}`}>{selected.kind === "restore_point" ? "restore point" : selected.kind} · {short(selected.sha)} · {ago(selected.at)}</div>
            <h1 className="mt-1.5 font-display text-[32px] font-medium leading-[1.1] tracking-[-.02em] text-txt">{selected.title}</h1>
            <p className="mt-2.5 text-[13px] text-muted">
              {selected.kind === "merge" && <>{selected.who} · <span className="font-mono">{selected.branch} → {repo.default_branch}</span> · </>}
              {selected.kind === "push" && <>{selected.who} · {selected.commits} commit{selected.commits === 1 ? "" : "s"} to {repo.default_branch} · </>}
              {selected.kind === "restore_point" && <>{selected.env ? `${selected.env} · ` : ""}</>}
              {new Date(selected.at).toLocaleString()} · {revertEnabled ? "Revert opens a pull request (Rules → Revert from History is on)" : "turn on “Revert from History” under Rules to revert from here"}
            </p>
            {selected.files.length > 0 && (
              <div className="mt-5 font-mono text-[12px] leading-[2] text-body">{selected.files.map((f) => <div key={f} className="truncate">{f}</div>)}</div>
            )}
            {revertEnabled && selected.before && selected.sha && (
              <form action={revertFromHistory} className="mt-7 flex items-center gap-3.5 rounded-xl border border-line bg-row px-[18px] py-4">
                <DeskNext /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="sha" value={selected.sha} /><input type="hidden" name="before" value={selected.before} /><input type="hidden" name="label" value={selected.title} />
                <Button size="lg">Create revert PR</Button>
                <span className="text-[12.5px] leading-[1.5] text-muted">Opens a PR on GitHub restoring the files this change touched — a teammate reviews it. DevBrain never touches main directly.</span>
              </form>
            )}
            {selected.sha && (
              <Section title="Do it by hand">
                <div className="mt-3">
                  <Eyebrow>inspect this point in time</Eyebrow>
                  <CodeBlock className="mt-1.5 select-all">git fetch origin && git checkout -b inspect-{short(selected.sha)} {selected.sha}</CodeBlock>
                </div>
                <div className="mt-4">
                  <Eyebrow>{selected.kind === "merge" ? "undo this merge (safe — via a new PR)" : "undo this change (safe — via a new PR)"}</Eyebrow>
                  <CodeBlock className="mt-1.5 select-all">git checkout -b revert-{short(selected.sha)} origin/{repo.default_branch} && git revert {selected.kind === "merge" ? "-m 1 " : ""}{selected.sha} && git push -u origin revert-{short(selected.sha)}</CodeBlock>
                  <p className="mt-1.5 text-[12px] text-faint">Then open a PR from revert-{short(selected.sha)} — a teammate reviews, same as any change.</p>
                </div>
                <div className="mt-4">
                  <Eyebrow>or just tell your Claude</Eyebrow>
                  <blockquote className="mt-1.5 select-all border-l-2 border-accent2 px-3.5 py-1 font-display text-[15px] italic text-body">Roll {repo.default_branch} back past {short(selected.sha)} ({selected.title.replace(/"/g, "'").slice(0, 60)}) — make the revert branch and PR for me.</blockquote>
                </div>
              </Section>
            )}
          </>
        )}
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </Reading>
    </>
  );
}
