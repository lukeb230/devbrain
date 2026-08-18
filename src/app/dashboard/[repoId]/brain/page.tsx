import { marked } from "marked";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { fetchBrainDocs } from "@/lib/github";
import { supabaseServer } from "@/lib/supabase/server";
import { BrainGraph } from "./graph";

export const dynamic = "force-dynamic";

// The Second Brain, Obsidian-style: a clickable knowledge graph on the left,
// the selected note on the right — rendered per branch straight from the
// repo's .brain/ folder, so this is exactly what that branch's Claude reads.

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

  const hrefFor = (slug: string) =>
    `/dashboard/${repo.id}/brain?${new URLSearchParams({
      ...(branch ? { branch } : {}),
      note: slug,
    }).toString()}`;

  const selectedSlug = note || "index";
  const current = graph.bySlug.get(selectedSlug) ?? graph.bySlug.get("index") ?? graph.notes[0];
  const backlinks = current ? (graph.backlinks.get(current.slug) ?? []) : [];

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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-6">
        <Link href={`/dashboard/${repo.id}`} className="text-sm text-slate-400 hover:text-white">
          ← {repo.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Second Brain</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">branch:</span>
          {branchNames.map((b) => (
            <Link
              key={b}
              href={`/dashboard/${repo.id}/brain?${new URLSearchParams({
                ...(b === repo.default_branch ? {} : { branch: b }),
                ...(current ? { note: current.slug } : {}),
              }).toString()}`}
              className={
                "rounded px-2 py-0.5 " +
                (b === ref ? "bg-brand-600 font-semibold text-ink-950" : "bg-ink-800 text-slate-300 hover:text-white")
              }
            >
              {b}
            </Link>
          ))}
        </div>
      </header>

      {graph.notes.length === 0 ? (
        <div className="panel text-sm text-slate-400">
          <p>
            No brain on <strong>{ref}</strong> yet. Run the plugin&apos;s{" "}
            <strong>generate-brain</strong> skill in a Claude Code session on
            this repo (“generate the brain for this repo”) — it builds the
            linked knowledge graph as a PR.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <section className="panel self-start">
            <h2 className="mb-2 text-sm font-semibold text-slate-400">
              {graph.notes.length} notes · {edges.length} connections — click a dot
            </h2>
            <BrainGraph nodes={nodes} edges={edges} selected={current?.slug ?? null} hrefFor={hrefFor} />
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              {[["feature", "#34d399"], ["module", "#60a5fa"], ["screen", "#22d3ee"], ["data", "#c084fc"], ["decision", "#fbbf24"], ["gotcha", "#f87171"], ["overview", "#2dd4bf"]].map(([t, c]) => (
                <span key={t} className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full" style={{ background: c }} /> {t}
                </span>
              ))}
            </div>
          </section>

          {current && (
            <section className="panel self-start">
              <div className="mb-3 flex items-baseline justify-between border-b border-ink-700 pb-2">
                <h2 className="text-lg font-semibold text-white">{current.title}</h2>
                <span className="text-xs text-slate-500">{current.type}</span>
              </div>
              {current.touches.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {current.touches.map((f) => (
                    <code key={f} className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-slate-400">{f}</code>
                  ))}
                </div>
              )}
              <div
                className="brain-prose text-sm leading-relaxed text-slate-300"
                dangerouslySetInnerHTML={{
                  __html: marked.parse(esc(linkifyBody(current.body, byTitle, hrefFor))) as string,
                }}
              />
              {backlinks.length > 0 && (
                <div className="mt-4 border-t border-ink-700 pt-3 text-xs text-slate-500">
                  Linked from:{" "}
                  {backlinks.map((b, i) => (
                    <span key={b}>
                      {i > 0 && " · "}
                      <Link href={hrefFor(b)} className="text-brand-400 hover:text-brand-500">
                        {graph.bySlug.get(b)?.title ?? b}
                      </Link>
                    </span>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </main>
  );
}
