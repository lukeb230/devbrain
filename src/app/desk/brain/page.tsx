import Link from "next/link";
import { marked } from "marked";
import { redirect } from "next/navigation";
import { BrainExplorer, type NotePayload } from "@/app/dashboard/[repoId]/brain/explorer";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { cachedBrainDocs } from "@/lib/brain-cache";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { RepoChooser } from "../repo-chooser";
import { staleBrain } from "@/lib/brain-stale";
import { Card, Chip, Empty, PageTitle } from "../ui";

// ============================================================================
// Desk · Brain — the repo's linked notes as a graph with a reading pane, on
// any branch. The explorer is the dashboard's client component; the graph is
// built the same way (same parser, same cache). Regenerating is a line you
// paste to your Claude — the brain is a PR, never a DevBrain write.
// ============================================================================

export const dynamic = "force-dynamic";

function esc(s: string) {
  return s.replace(/</g, "&lt;");
}

export default async function DeskBrain({ searchParams }: { searchParams: Promise<{ repo?: string; branch?: string; note?: string }> }) {
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
        <PageTitle title="Brain" sub="One repo's linked notes." />
        <RepoChooser repos={repos ?? []} route="/desk/brain" what="brain" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const since72h = new Date(Date.now() - 72 * 3600_000).toISOString();
  const [{ data: branchRows }, { data: mergedRows }, { data: mergedPrs }] = await Promise.all([
    supabase.from("branches").select("name, merged_at").eq("repo_id", repo.id).order("last_push_at", { ascending: false }).limit(15),
    supabase.from("branches").select("name, changed_files, merged_at").eq("repo_id", repo.id).gte("merged_at", since72h),
    supabase.from("prs").select("number, title, head_branch").eq("repo_id", repo.id).neq("state", "open").gte("updated_at", since72h),
  ]);
  const stale = staleBrain(mergedRows ?? [], mergedPrs ?? []);
  const ref = sp.branch || repo.default_branch;
  const base = withScope("/desk/brain", scope);
  const hrefFor = (slug: string) => `${base}${sp.branch ? `&branch=${encodeURIComponent(sp.branch)}` : ""}&note=${slug}`;

  let notes: NotePayload[] = [];
  let nodes: { slug: string; title: string; type: string; degree: number }[] = [];
  let edges: { a: string; b: string }[] = [];
  let failed = false;
  try {
    const files = await cachedBrainDocs(repo.installation_id, repo.full_name, ref);
    const graph = parseBrain(files);
    const byTitle = new Map(graph.notes.map((n) => [n.title.toLowerCase(), n.slug]));
    notes = graph.notes.map((n) => ({
      slug: n.slug,
      title: n.title,
      type: n.type,
      touches: n.touches,
      html: marked.parse(esc(linkifyBody(n.body, byTitle, hrefFor))) as string,
      backlinks: (graph.backlinks.get(n.slug) ?? []).map((b) => ({ slug: b, title: graph.bySlug.get(b)?.title ?? b })),
    }));
    nodes = graph.notes.map((n) => ({ slug: n.slug, title: n.title, type: n.type, degree: n.links.length + (graph.backlinks.get(n.slug)?.length ?? 0) }));
    const seen = new Set<string>();
    for (const n of graph.notes) {
      for (const l of n.links) {
        const key = [n.slug, l].sort().join("→");
        if (!seen.has(key)) { seen.add(key); edges.push({ a: n.slug, b: l }); }
      }
    }
  } catch {
    failed = true;
  }
  const branchNames = [repo.default_branch, ...(branchRows ?? []).filter((b) => !b.merged_at && b.name !== repo.default_branch).map((b) => b.name)];

  return (
    <>
      <PageTitle
        title="Brain"
        sub={<span className="flex flex-wrap items-center gap-1.5">{repo.full_name} · {notes.length} notes on <span className="font-mono">{ref}</span><span className="ml-2 text-faint">branch:</span>{branchNames.map((b) => <Link key={b} href={`${base}${b === repo.default_branch ? "" : `&branch=${encodeURIComponent(b)}`}`} className={b === ref ? "" : "opacity-70 hover:opacity-100"}><Chip tone={b === ref ? "violet" : "muted"}>{b}</Chip></Link>)}</span>}
      />
      {failed ? (
        <Card title="Could not read the brain"><Empty>GitHub didn&apos;t return the .brain/ folder for {ref}. Check the app still has access to {repo.full_name}.</Empty></Card>
      ) : notes.length === 0 ? (
        <Card title="No brain yet">
          <p className="text-[12.5px] text-txt">No <span className="font-mono">.brain/</span> on <span className="font-mono">{ref}</span>. Tell your Claude, in a session on this repo:</p>
          <pre className="mt-2 rounded-lg border border-line2 bg-ink px-2.5 py-2 font-mono text-[11px] text-[var(--wg-code)]">generate the brain for this repo</pre>
          <p className="mt-1.5 text-[11px] text-faint">The plugin&apos;s generate-brain skill builds the linked knowledge graph and opens it as a PR.</p>
        </Card>
      ) : (
        <div className="rounded-xl border border-line bg-row p-2">
          <BrainExplorer notes={notes} nodes={nodes} edges={edges} initialSlug={sp.note || "index"} repoId={repo.id} branch={sp.branch ?? null} searchable />
        </div>
      )}
      {stale.length > 0 && (
        <Card title="Merged without a brain update" count={stale.length} right="last 72h" className="mt-3">
          {stale.map((s) => (
            <div key={s.branch} className="flex items-start gap-2.5 border-t border-line py-1.5 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] text-txt">{s.pr ? `#${s.pr} ` : ""}{s.title ?? s.branch}</div>
                <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted">{s.code_files.slice(0, 4).join(" · ")}{s.code_files.length > 4 ? ` · +${s.code_files.length - 4}` : ""}</div>
              </div>
              <span className="font-mono text-[10px] text-faint">{s.merged_at ? new Date(s.merged_at).toLocaleDateString() : ""}</span>
            </div>
          ))}
          <p className="mt-2 text-[10.5px] text-faint">Code changed but nothing in <span className="font-mono">.brain/</span> did. Tell your Claude &ldquo;repair the brain notes for the files that changed&rdquo; — it sees this same list in its context.</p>
        </Card>
      )}
      {stale.length === 0 && <p className="mt-2 text-[10.5px] text-faint">Every merge in the last 72h that changed code also updated the brain.</p>}
    </>
  );
}
