import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { Live } from "../live";
import { completeTask, createTask, reopenTask } from "./actions";

export const dynamic = "force-dynamic";

// Team task board — anyone creates tasks with a priority and tags; the list
// auto-groups by priority. Claudes see open tasks in their context digest and
// can complete them via MCP; completed tasks keep for 72h, then auto-purge.

const PRESET_TAGS = ["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"];

const PRIORITIES: Record<number, { label: string; chip: string; ring: string }> = {
  1: { label: "P1 · Critical", chip: "bg-red-50 text-red-700 border border-red-200", ring: "border-l-red-500" },
  2: { label: "P2 · High", chip: "bg-amber-50 text-amber-700 border border-amber-200", ring: "border-l-amber-400" },
  3: { label: "P3 · Medium", chip: "bg-brand-50 text-brand-700 border border-brand-100", ring: "border-l-brand-400" },
  4: { label: "P4 · Low", chip: "bg-slate-100 text-slate-600 border border-slate-200", ring: "border-l-slate-300" },
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function TasksPage({
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

  const { data: tasks } = await supabase
    .from("tasks")
    .select("id, title, detail, priority, tags, status, created_by, created_at, done_by, done_at")
    .eq("repo_id", repo.id)
    .order("priority")
    .order("created_at");

  const open = (tasks ?? []).filter((t) => t.status === "open");
  const done = (tasks ?? [])
    .filter((t) => t.status === "done")
    .sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));
  const byPriority = new Map<number, typeof open>();
  for (const t of open) {
    if (!byPriority.has(t.priority)) byPriority.set(t.priority, []);
    byPriority.get(t.priority)!.push(t);
  }

  return (
    <>
      <AppNav
        live={<Live repoId={repo.id} />}
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}` },
          { label: "Tasks", href: `/dashboard/${repo.id}/tasks`, active: true },
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
          { label: "Rules", href: `/dashboard/${repo.id}/rules` },
        ]}
      />
      <main className="mx-auto max-w-5xl px-6 py-6">
        <div className="mb-1 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Tasks</h1>
          <span className="text-sm text-slate-500">{repo.full_name}</span>
        </div>
        <p className="mb-5 max-w-2xl text-sm text-slate-500">
          The team&apos;s shared to-do list, auto-sorted by priority. Every dev&apos;s
          Claude sees open tasks live and can suggest, pick up, and complete them.
        </p>

        {/* Create */}
        <section className="card mb-6 card-pad">
          <form action={createTask} className="space-y-3">
            <input type="hidden" name="repoId" value={repo.id} />
            <div className="flex gap-2">
              <input
                name="title"
                required
                placeholder="What needs to be done?"
                className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <select
                name="priority"
                defaultValue="3"
                className="rounded-md border border-slate-300 bg-white px-2 py-2 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
              >
                <option value="1">P1 · Critical</option>
                <option value="2">P2 · High</option>
                <option value="3">P3 · Medium</option>
                <option value="4">P4 · Low</option>
              </select>
              <button
                type="submit"
                className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                Add task
              </button>
            </div>
            <input
              name="detail"
              placeholder="Optional detail — context, files, acceptance criteria"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-1.5">
              {PRESET_TAGS.map((t) => (
                <label key={t} className="cursor-pointer">
                  <input type="checkbox" name="tags" value={t} className="peer sr-only" />
                  <span className="chip border border-slate-200 bg-white text-slate-600 hover:border-slate-300 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
                    {t}
                  </span>
                </label>
              ))}
              <input
                name="customTags"
                placeholder="+ custom tags, comma-separated"
                className="w-56 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
              />
            </div>
          </form>
        </section>

        {/* Open, grouped by priority */}
        {open.length === 0 ? (
          <section className="card mb-6 card-pad">
            <p className="text-sm text-slate-500">No open tasks. Add the first one above.</p>
          </section>
        ) : (
          [1, 2, 3, 4].map((p) => {
            const group = byPriority.get(p);
            if (!group || group.length === 0) return null;
            const meta = PRIORITIES[p];
            return (
              <section key={p} className={`card mb-4 border-l-4 ${meta.ring}`}>
                <div className="border-b border-slate-100 px-4 py-2">
                  <span className={`chip ${meta.chip}`}>{meta.label}</span>
                  <span className="ml-2 text-xs text-slate-400">{group.length} open</span>
                </div>
                <ul className="divide-y divide-slate-100">
                  {group.map((t) => (
                    <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                      <form action={completeTask} className="mt-0.5">
                        <input type="hidden" name="repoId" value={repo.id} />
                        <input type="hidden" name="id" value={t.id} />
                        <button
                          title="Mark complete"
                          className="h-4.5 w-4.5 rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
                          style={{ height: 18, width: 18 }}
                        />
                      </form>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-slate-900">{t.title}</div>
                        {t.detail && <div className="text-xs text-slate-500">{t.detail}</div>}
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          {((t.tags as string[]) ?? []).map((tag) => (
                            <span key={tag} className="chip bg-slate-100 text-slate-600">{tag}</span>
                          ))}
                          <span className="text-xs text-slate-400">
                            {t.created_by} · {timeAgo(t.created_at)}
                          </span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}

        {/* Completed */}
        <section className="card mt-6">
          <div className="border-b border-slate-100 px-4 py-2">
            <span className="card-title">Completed</span>
            <span className="ml-2 text-xs text-slate-400">auto-removes after 72h</span>
          </div>
          {done.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">Nothing completed recently.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {done.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-4 py-2.5">
                  <span
                    className="mt-0.5 flex items-center justify-center rounded bg-emerald-500 text-[11px] font-bold text-white"
                    style={{ height: 18, width: 18 }}
                  >
                    ✓
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-500 line-through">{t.title}</div>
                    <div className="text-xs text-slate-400">
                      done by {t.done_by} · {t.done_at ? timeAgo(t.done_at) : ""}
                    </div>
                  </div>
                  <form action={reopenTask}>
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="id" value={t.id} />
                    <button className="text-xs text-slate-400 hover:text-brand-600">Reopen</button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
