import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { uploadSpec } from "./actions";
import { SpecDropzone } from "./dropzone";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // PDF transcription happens in the upload action

// Specs — target state. The brain says what the app IS; a spec says what it
// SHOULD BE. Coverage falls out of comparing the two.

const VERDICTS = [
  { key: "conflict", label: "Conflicts", cls: "bg-red-500" },
  { key: "missing", label: "Not built", cls: "bg-slate-400" },
  { key: "partial", label: "Partial", cls: "bg-amber-400" },
  { key: "done", label: "Looks done", cls: "bg-emerald-500" },
] as const;

export default async function SpecsPage({
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
    .select("id, full_name")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  const [{ data: specs }, { data: items }] = await Promise.all([
    supabase
      .from("specs")
      .select("id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at")
      .eq("repo_id", repo.id)
      .order("created_at", { ascending: false }),
    supabase.from("spec_items").select("spec_id, verdict, dismissed_at, task_id").eq("repo_id", repo.id),
  ]);

  const countsFor = (specId: string) => {
    const mine = (items ?? []).filter((i) => i.spec_id === specId && !i.dismissed_at);
    const by: Record<string, number> = { done: 0, partial: 0, missing: 0, conflict: 0 };
    for (const i of mine) by[i.verdict] = (by[i.verdict] ?? 0) + 1;
    return { by, total: mine.length };
  };

  return (
    <>
      <AppNav
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}` },
          { label: "Tasks", href: `/dashboard/${repo.id}/tasks` },
          { label: "Specs", href: `/dashboard/${repo.id}/specs`, active: true },
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
          { label: "History", href: `/dashboard/${repo.id}/history` },
          { label: "Rules", href: `/dashboard/${repo.id}/rules` },
        ]}
      />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-1 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Specs</h1>
          <span className="text-sm text-slate-500">{repo.full_name}</span>
        </div>
        <p className="mb-5 max-w-2xl text-sm text-slate-500">
          Drop anything that describes where this app is going — a brief, a
          braindump from another Claude session, a PDF of mockups. DevBrain
          pulls out what it asks for, checks each thing against the brain, the
          repo, and the task board, and shows you what&apos;s already built,
          what&apos;s half-built, what&apos;s missing, and what contradicts a
          decision you already made.
        </p>

        <div className="mb-6">
          <SpecDropzone repoId={repo.id} action={uploadSpec} />
        </div>

        {(!specs || specs.length === 0) && (
          <p className="text-sm text-slate-400">No context docs yet.</p>
        )}

        <div className="space-y-3">
          {(specs ?? []).map((s) => {
            const { by, total } = countsFor(s.id);
            return (
              <Link
                key={s.id}
                href={`/dashboard/${repo.id}/specs/${s.id}`}
                className="card block card-pad transition-colors hover:border-brand-300"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-slate-900">{s.title}</span>
                  <span className="chip bg-slate-100 text-slate-500">{s.source_kind}</span>
                  {s.status === "new" && <span className="chip bg-amber-50 text-amber-700">queued</span>}
                  {s.status === "analyzing" && <span className="chip bg-amber-50 text-amber-700">analyzing…</span>}
                  {s.status === "failed" && <span className="chip bg-red-50 text-red-700">failed</span>}
                  <span className="ml-auto text-xs text-slate-400">
                    {s.uploaded_by} · {new Date(s.created_at).toLocaleDateString()}
                  </span>
                </div>

                {s.status === "ready" && total > 0 && (
                  <>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-slate-100">
                      {VERDICTS.map((v) =>
                        by[v.key] ? (
                          <span
                            key={v.key}
                            className={v.cls}
                            style={{ width: `${(by[v.key] / total) * 100}%` }}
                            title={`${by[v.key]} ${v.label.toLowerCase()}`}
                          />
                        ) : null,
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span>{total} requirements</span>
                      {VERDICTS.map((v) =>
                        by[v.key] ? (
                          <span key={v.key} className="inline-flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${v.cls}`} />
                            {by[v.key]} {v.label.toLowerCase()}
                          </span>
                        ) : null,
                      )}
                    </div>
                  </>
                )}
                {s.status !== "ready" && s.status !== "failed" && (
                  <p className="mt-1 text-xs text-slate-400">
                    Analysis runs on the next agent tick (within ~2 minutes).
                  </p>
                )}
                {s.status === "failed" && (
                  <p className="mt-1 text-xs text-red-600">{s.error}</p>
                )}
              </Link>
            );
          })}
        </div>
      </main>
    </>
  );
}
