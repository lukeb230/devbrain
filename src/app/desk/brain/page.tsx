import { marked } from "marked";
import { redirect } from "next/navigation";
import type { NotePayload } from "@/app/dashboard/[repoId]/brain/explorer";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { cachedBrainDocs } from "@/lib/brain-cache";
import { staleBrain } from "@/lib/brain-stale";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { ListPane, Reading } from "../panes";
import { RepoChooser } from "../repo-chooser";
import { Card, Empty, H1 } from "../ui";
import { BrainDesk } from "./explorer";

// ============================================================================
// Desk · Brain (Dusk) — the repo's linked notes: list pane of notes + the
// reading pane with the graph aside (BrainDesk, client). Same parser and
// cache as before. Regenerating is a line you paste to your Claude — the
// brain is a PR, never a DevBrain write.
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
  if (!scope.repoId) return <RepoChooser repos={repos ?? []} route="/desk/brain" what="brain" title="Brain" />;
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
  const edges: { a: string; b: string }[] = [];
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

  if (failed || notes.length === 0) {
    return (
      <>
        <ListPane title="Brain" count="0 notes"><p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">{failed ? "Could not read the brain." : `No notes on ${ref}.`}</p></ListPane>
        <Reading>
          <H1 title="Brain" sub={`${repo.full_name} · ${ref}`} />
          <Card pad="sm" className="mt-6 max-w-[420px]">
            <div className="font-display text-[13px] font-semibold text-txt">{failed ? "Could not read the brain" : "No brain yet"}</div>
            {failed ? (
              <Empty className="mt-2 py-0">GitHub didn&apos;t return the .brain/ folder for {ref}. Check the app still has access to {repo.full_name}.</Empty>
            ) : (
              <>
                <p className="mt-2 text-[12.5px] leading-[1.55] text-faint">No <span className="font-mono">.brain/</span> on {ref}. Tell your Claude, in a session on this repo:</p>
                <pre className="mt-2 rounded-lg border border-line2 bg-ink px-2.5 py-2 font-mono text-[11px] text-txt">generate the brain for this repo</pre>
                <p className="mt-2 text-[11.5px] text-faint">The plugin&apos;s generate-brain skill builds the linked knowledge graph and opens it as a PR.</p>
              </>
            )}
          </Card>
        </Reading>
      </>
    );
  }

  return <BrainDesk notes={notes} nodes={nodes} edges={edges} initialSlug={sp.note || "index"} branchNames={branchNames} currentRef={ref} defaultBranch={repo.default_branch} base={base} stale={stale} repoName={repo.full_name} />;
}
