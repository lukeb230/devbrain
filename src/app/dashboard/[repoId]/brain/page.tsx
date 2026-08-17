import { marked } from "marked";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { fetchBrainDocs } from "@/lib/github";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The Second Brain, visible to humans — rendered per branch straight from the
// repo's .brain/ folder, so what you read here is exactly what every Claude
// on that branch reads. Markdown only; raw HTML is escaped before rendering.

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default async function BrainPage({
  params,
  searchParams,
}: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ branch?: string }>;
}) {
  const { repoId } = await params;
  const { branch } = await searchParams;
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
  const docs = await fetchBrainDocs(repo.installation_id, repo.full_name, ref);

  const branchNames = [
    repo.default_branch,
    ...(branchRows ?? [])
      .filter((b) => !b.merged_at && b.name !== repo.default_branch)
      .map((b) => b.name),
  ];

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <Link href={`/dashboard/${repo.id}`} className="text-sm text-slate-400 hover:text-white">
          ← {repo.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Second Brain</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-500">branch:</span>
          {branchNames.map((b) => (
            <Link
              key={b}
              href={`/dashboard/${repo.id}/brain${b === repo.default_branch ? "" : `?branch=${encodeURIComponent(b)}`}`}
              className={
                "rounded px-2 py-0.5 " +
                (b === ref
                  ? "bg-brand-600 font-semibold text-ink-950"
                  : "bg-ink-800 text-slate-300 hover:text-white")
              }
            >
              {b}
            </Link>
          ))}
        </div>
      </header>

      {docs.length === 0 ? (
        <div className="panel text-sm text-slate-400">
          <p>
            No <code className="rounded bg-ink-800 px-1">.brain/</code> folder on{" "}
            <strong>{ref}</strong>. Seed one with markdown docs (overview,
            architecture, decisions, gotchas) and it renders here — and becomes
            what every Claude reads first.
          </p>
        </div>
      ) : (
        docs.map((d) => (
          <article key={d.name} className="panel mb-6">
            <h2 className="mb-3 border-b border-ink-700 pb-2 text-sm font-semibold text-brand-400">
              .brain/{d.name}
            </h2>
            <div
              className="brain-prose text-sm leading-relaxed text-slate-300"
              dangerouslySetInnerHTML={{ __html: marked.parse(esc(d.content)) as string }}
            />
          </article>
        ))
      )}
    </main>
  );
}
