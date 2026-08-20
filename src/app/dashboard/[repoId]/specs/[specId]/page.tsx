import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { createTasksFromItems, deleteSpec, dismissItem, requeueSpec, restoreItem } from "../actions";

export const dynamic = "force-dynamic";

// Review screen. Conflicts first — a doc contradicting a recorded decision is
// the most valuable thing here and never becomes a task automatically.

const GROUPS = [
  {
    key: "conflict",
    title: "Conflicts with a decision",
    blurb: "The doc asks for something that contradicts the brain or what already shipped. Decide before building.",
    ring: "border-l-red-500",
    chip: "bg-red-50 text-red-700",
    selectable: false,
  },
  {
    key: "missing",
    title: "Not built",
    blurb: "No evidence anywhere in the brain, the repo, or the board.",
    ring: "border-l-slate-400",
    chip: "bg-slate-100 text-slate-600",
    selectable: true,
  },
  {
    key: "partial",
    title: "Partially built",
    blurb: "Some of it exists — scaffolding, or a related piece.",
    ring: "border-l-amber-400",
    chip: "bg-amber-50 text-amber-700",
    selectable: true,
  },
  {
    key: "done",
    title: "Looks done — verify",
    blurb: "Strong evidence it already exists. DevBrain can't run the code, so confirm before trusting it.",
    ring: "border-l-emerald-500",
    chip: "bg-emerald-50 text-emerald-700",
    selectable: true,
  },
] as const;

export default async function SpecPage({
  params,
}: {
  params: Promise<{ repoId: string; specId: string }>;
}) {
  const { repoId, specId } = await params;
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

  const [{ data: spec }, { data: items }] = await Promise.all([
    supabase
      .from("specs")
      .select("id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at, body")
      .eq("id", specId)
      .eq("repo_id", repo.id)
      .single(),
    supabase
      .from("spec_items")
      .select("id, requirement, detail, verdict, confidence, evidence, suggested_priority, suggested_tags, task_id, dismissed_at")
      .eq("spec_id", specId)
      .order("created_at"),
  ]);
  if (!spec) notFound();

  const live = (items ?? []).filter((i) => !i.dismissed_at);
  const dismissed = (items ?? []).filter((i) => i.dismissed_at);
  const linked = live.filter((i) => i.task_id).length;

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
        <Link href={`/dashboard/${repo.id}/specs`} className="text-xs text-slate-400 hover:text-brand-600">
          ← All specs
        </Link>
        <div className="mb-1 mt-2 flex flex-wrap items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">{spec.title}</h1>
          <span className="chip bg-slate-100 text-slate-500">{spec.source_kind}</span>
          {spec.source_name && <span className="text-xs text-slate-400">{spec.source_name}</span>}
        </div>
        <p className="mb-5 text-sm text-slate-500">
          Added by {spec.uploaded_by} · {live.length} requirements
          {linked > 0 ? ` · ${linked} turned into tasks` : ""}
        </p>

        {spec.status !== "ready" && (
          <section className="card mb-6 card-pad">
            {spec.status === "failed" ? (
              <>
                <p className="text-sm text-red-700">Analysis failed: {spec.error}</p>
                <form action={requeueSpec} className="mt-2">
                  <input type="hidden" name="repoId" value={repo.id} />
                  <input type="hidden" name="specId" value={spec.id} />
                  <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                    Try again
                  </button>
                </form>
              </>
            ) : (
              <p className="text-sm text-slate-500">
                Queued for analysis — the agent picks it up within ~2 minutes.
                This page updates itself when it&apos;s done.
              </p>
            )}
          </section>
        )}

        {spec.status === "ready" && live.length > 0 && (
          <form action={createTasksFromItems}>
            <input type="hidden" name="repoId" value={repo.id} />
            <input type="hidden" name="specId" value={spec.id} />

            <div className="sticky top-14 z-10 mb-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
              <span className="text-sm text-slate-600">
                Check what you want on the board, then:
              </span>
              <button className="ml-auto rounded-md bg-brand-600 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
                Create tasks
              </button>
            </div>

            {GROUPS.map((g) => {
              const rows = live.filter((i) => i.verdict === g.key);
              if (rows.length === 0) return null;
              return (
                <section key={g.key} className={`card mb-4 border-l-4 ${g.ring}`}>
                  <div className="border-b border-slate-100 px-4 py-2.5">
                    <div className="flex items-baseline gap-2">
                      <h2 className="font-semibold text-slate-900">{g.title}</h2>
                      <span className="text-xs text-slate-400">{rows.length}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{g.blurb}</p>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {rows.map((i) => (
                      <li key={i.id} className="flex items-start gap-3 px-4 py-3">
                        {i.task_id ? (
                          <span
                            className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded bg-brand-600 text-[10px] font-bold text-white"
                            title="Already a task"
                          >
                            ✓
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            name="item"
                            value={i.id}
                            defaultChecked={g.key === "missing"}
                            className="mt-0.5 h-4 w-4 flex-shrink-0 rounded border-slate-300"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-slate-900">{i.requirement}</div>
                          {i.detail && <div className="text-xs text-slate-500">{i.detail}</div>}
                          {i.evidence && (
                            <div className="mt-1 text-xs text-slate-500">
                              <span className="font-medium text-slate-600">Evidence: </span>
                              {i.evidence}
                            </div>
                          )}
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`chip ${g.chip}`}>P{i.suggested_priority}</span>
                            {((i.suggested_tags as string[]) ?? []).map((t) => (
                              <span key={t} className="chip bg-slate-100 text-slate-500">{t}</span>
                            ))}
                            {i.confidence === "low" && (
                              <span className="text-xs text-slate-400">low confidence</span>
                            )}
                            {i.task_id && (
                              <Link
                                href={`/dashboard/${repo.id}/tasks`}
                                className="text-xs text-brand-600 hover:underline"
                              >
                                on the board
                              </Link>
                            )}
                          </div>
                        </div>
                        <button
                          formAction={dismissItem}
                          name="id"
                          value={i.id}
                          className="flex-shrink-0 text-xs text-slate-400 hover:text-slate-700"
                        >
                          Dismiss
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </form>
        )}

        {dismissed.length > 0 && (
          <section className="card mb-4 card-pad">
            <h2 className="card-title mb-2">Dismissed ({dismissed.length})</h2>
            <ul className="space-y-1">
              {dismissed.map((i) => (
                <li key={i.id} className="flex items-center gap-2 text-sm text-slate-400">
                  <span className="min-w-0 flex-1 truncate line-through">{i.requirement}</span>
                  <form action={restoreItem}>
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="specId" value={spec.id} />
                    <input type="hidden" name="id" value={i.id} />
                    <button className="text-xs text-slate-400 hover:text-brand-600">Restore</button>
                  </form>
                </li>
              ))}
            </ul>
          </section>
        )}

        <details className="card mb-4 card-pad">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Source text
          </summary>
          <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
            {spec.body}
          </pre>
        </details>

        <div className="flex items-center gap-3">
          {spec.status === "ready" && (
            <form action={requeueSpec}>
              <input type="hidden" name="repoId" value={repo.id} />
              <input type="hidden" name="specId" value={spec.id} />
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50">
                Re-analyze against current code
              </button>
            </form>
          )}
          <form action={deleteSpec} className="ml-auto">
            <input type="hidden" name="repoId" value={repo.id} />
            <input type="hidden" name="specId" value={spec.id} />
            <button className="text-xs text-slate-400 hover:text-red-600">Delete this spec</button>
          </form>
        </div>
      </main>
    </>
  );
}
