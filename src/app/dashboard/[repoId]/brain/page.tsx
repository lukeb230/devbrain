import { marked } from "marked";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { fetchBrainDocs } from "@/lib/github";
import { supabaseServer } from "@/lib/supabase/server";
import { BrainExplorer, type NotePayload } from "./explorer";

export const dynamic = "force-dynamic";

// The Second Brain, Obsidian-style. The server renders EVERY note's HTML in
// one pass and hands the set to a client explorer — so note switching, node
// clicks, and wikilink hops are instant, with a live physics graph.
// Branch switching stays server-side (different git ref = different brain).

function esc(s: string) {
  return s.replace(/</g, "&lt;");
}

export default async function BrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ branch?: string; note?: string }>;
}) {
  const { repoId } = await params;
  const { branch, note } = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, full_name, default_branch, installation_id")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  const { data: branchRows } = await supabase
    .from("branches")
    .select("name, merged_at")
    .eq("repo_id", repo.id)
    .order("last_push_at", { ascending: false })
    .limit(15);

  const ref = branch || repo.default_branch;
  const files = await fetchBrainDocs(repo.installation_id, repo.full_name, ref);
  const graph = parseBrain(files);
  const byTitle = new Map(graph.notes.map((n) => [n.title.toLowerCase(), n.slug]));

  // Wikilinks render as ?note=slug hrefs; the client explorer intercepts them.
  const hrefFor = (slug: string) =>
    `/dashboard/${repo.id}/brain?${new URLSearchParams({
      ...(branch ? { branch } : {}),
      note: slug,
    }).toString()}`;

  const notesPayload: NotePayload[] = graph.notes.map((n) => ({
    slug: n.slug,
    title: n.title,
    type: n.type,
    touches: n.touches,
    html: marked.parse(esc(linkifyBody(n.body, byTitle, hrefFor))) as string,
    backlinks: (graph.backlinks.get(n.slug) ?? []).map((b) => ({
      slug: b,
      title: graph.bySlug.get(b)?.title ?? b,
    })),
  }));

  const nodes = graph.notes.map((n) => ({
    slug: n.slug,
    title: n.title,
    type: n.type,
    degree: n.links.length + (graph.backlinks.get(n.slug)?.length ?? 0),
  }));
  const edges: { a: string; b: string }[] = [];
  const seen = new Set<string>();
  for (const n of graph.notes) {
    for (const l of n.links) {
      const key = [n.slug, l].sort().join("→");
      if (!seen.has(key)) {
        seen.add(key);
        edges.push({ a: n.slug, b: l });
      }
    }
  }

  const branchNames = [
    repo.default_branch,
    ...(branchRows ?? [])
      .filter((b) => !b.merged_at && b.name !== repo.default_branch)
      .map((b) => b.name),
  ];

  return (
    <>
      <AppNav
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}` },
          { label: "Brain", href: `/dashboard/${repo.id}/brain`, active: true },
          { label: "Rules", href: `/dashboard/${repo.id}/rules` },
        ]}
      />
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Second Brain
            <span className="ml-2 text-sm font-normal text-slate-500">{repo.full_name}</span>
          </h1>
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="text-xs text-slate-400">branch</span>
            {branchNames.map((b) => (
              <Link
                key={b}
                href={`/dashboard/${repo.id}/brain?${new URLSearchParams(
                  b === repo.default_branch ? {} : { branch: b },
                ).toString()}`}
                className={
                  "rounded-md px-2 py-0.5 text-xs " +
                  (b === ref
                    ? "bg-brand-600 font-medium text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300")
                }
              >
                {b}
              </Link>
            ))}
          </div>
        </div>

        {graph.notes.length === 0 ? (
          <div className="card card-pad text-sm text-slate-600">
            <p>
              No brain on <strong>{ref}</strong> yet. Run the plugin&apos;s{" "}
              <strong>generate-brain</strong> skill in a Claude Code session on
              this repo (&quot;generate the brain for this repo&quot;) — it builds the
              linked knowledge graph as a PR.
            </p>
          </div>
        ) : (
          <BrainExplorer
            notes={notesPayload}
            nodes={nodes}
            edges={edges}
            initialSlug={note || "index"}
            repoId={repo.id}
            branch={branch ?? null}
          />
        )}
      </main>
    </>
  );
}
