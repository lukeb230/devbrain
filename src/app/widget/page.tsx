import { redirect } from "next/navigation";
import { PrBadges } from "@/components/PrBadges";
import { supabaseServer } from "@/lib/supabase/server";
import { completeTask } from "../dashboard/[repoId]/tasks/actions";
import { WidgetLive } from "./live";

export const dynamic = "force-dynamic";

// /widget — the compact panel view for the desktop edge widget (phase 1 of
// the Grammarly-style shell; also works in any skinny browser window).
// Team-wide, single dense column tuned for ~380px. No nav chrome.

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

const PRIORITY_CHIP: Record<number, string> = {
  1: "bg-red-50 text-red-700",
  2: "bg-amber-50 text-amber-700",
  3: "bg-brand-50 text-brand-700",
  4: "bg-slate-100 text-slate-600",
};

export default async function WidgetPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=widget");

  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: repos }, { data: sessions }, { data: prs }, { data: branches }, { data: tasks }, { data: feed }] =
    await Promise.all([
      supabase.from("linked_repos").select("id, full_name, default_branch").order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, branch, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, head_branch, review_state, draft, mergeable_state, html_url, updated_at").eq("state", "open").order("updated_at", { ascending: false }).limit(8),
      supabase.from("branches").select("repo_id, name, changed_files").is("merged_at", null),
      supabase.from("tasks").select("id, repo_id, title, priority, assigned_to").eq("status", "open").order("priority").order("created_at").limit(8),
      supabase.from("events").select("repo_id, kind, payload, at").in("kind", ["decision", "broadcast"]).order("at", { ascending: false }).limit(5),
    ]);

  const repoById = new Map((repos ?? []).map((r) => [r.id, r]));
  const short = (id: string) => repoById.get(id)?.full_name.split("/")[1] ?? "?";

  // Org-wide collisions (same logic as team home).
  const collisions: { repo: string; file: string; branches: string[] }[] = [];
  const byRepo = new Map<string, Map<string, string[]>>();
  for (const b of branches ?? []) {
    if (!byRepo.has(b.repo_id)) byRepo.set(b.repo_id, new Map());
    const m = byRepo.get(b.repo_id)!;
    for (const f of (b.changed_files as string[]) ?? []) {
      if (!m.has(f)) m.set(f, []);
      m.get(f)!.push(b.name);
    }
  }
  for (const [repoId, m] of byRepo) {
    for (const [file, bs] of m) {
      if (bs.length > 1) collisions.push({ repo: short(repoId), file, branches: bs });
    }
  }
  const conflicted = (prs ?? []).filter((p) => p.mergeable_state === "dirty").length;

  const stats = [
    { label: "Active", value: sessions?.length ?? 0, warn: false },
    { label: "PRs", value: prs?.length ?? 0, warn: false },
    { label: "Conflicts", value: conflicted, warn: conflicted > 0 },
    { label: "Collisions", value: collisions.length, warn: collisions.length > 0 },
  ];

  return (
    <main className="mx-auto min-h-screen max-w-[420px] bg-slate-50 px-3 py-3">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-[11px] font-bold text-white">D</span>
          <span className="text-sm font-semibold text-slate-900">DevBrain</span>
          <WidgetLive />
        </span>
        <a href="/dashboard" target="_blank" className="text-[11px] text-slate-400 hover:text-brand-600">
          Open dashboard
        </a>
      </div>

      {/* Stat row */}
      <div className="mb-3 grid grid-cols-4 gap-1.5">
        {stats.map((s) => (
          <div key={s.label} className="card px-2 py-1.5 text-center">
            <div className={"text-lg font-semibold tabular-nums " + (s.warn ? "text-red-600" : "text-slate-900")}>
              {s.value}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Collisions — promoted to top when present */}
      {collisions.length > 0 && (
        <div className="card mb-3 border-l-4 border-l-amber-400 px-3 py-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700">Collisions</div>
          <ul className="space-y-0.5 text-xs text-slate-700">
            {collisions.slice(0, 4).map((c) => (
              <li key={c.repo + c.file} className="truncate">
                <code className="text-amber-800">{c.file}</code>
                <span className="text-slate-400"> · {c.branches.join(" + ")}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Now working */}
      <div className="card mb-3 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Now working</div>
        {!sessions || sessions.length === 0 ? (
          <p className="text-xs text-slate-400">Nobody active right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-500" />
                <div className="min-w-0 text-xs leading-snug">
                  <span className="font-medium text-slate-900">{s.dev_label}</span>
                  <span className="text-slate-400"> · {short(s.repo_id)} · {timeAgo(s.last_seen)}</span>
                  {s.summary && <div className="truncate text-brand-600">{s.summary}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* PRs */}
      <div className="card mb-3 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Open PRs</div>
        {!prs || prs.length === 0 ? (
          <p className="text-xs text-slate-400">None open.</p>
        ) : (
          <ul className="space-y-2">
            {prs.map((pr) => (
              <li key={pr.repo_id + pr.number} className="text-xs leading-snug">
                <a href={pr.html_url ?? "#"} target="_blank" className="font-medium text-slate-900 hover:text-brand-600">
                  <span className="text-slate-400">#{pr.number}</span> {pr.title}
                </a>
                <div className="mt-0.5 flex flex-wrap items-center gap-1">
                  <PrBadges pr={pr} defaultBranch={repoById.get(pr.repo_id)?.default_branch ?? "main"} />
                  <span className="text-[10px] text-slate-400">{short(pr.repo_id)} · {pr.author}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Tasks */}
      <div className="card mb-3 px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Top tasks</div>
        {!tasks || tasks.length === 0 ? (
          <p className="text-xs text-slate-400">No open tasks.</p>
        ) : (
          <ul className="space-y-1.5">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-center gap-2">
                <form action={completeTask} className="flex-shrink-0">
                  <input type="hidden" name="repoId" value={t.repo_id} />
                  <input type="hidden" name="id" value={t.id} />
                  <button
                    title="Mark complete"
                    className="block rounded border border-slate-300 bg-white hover:border-brand-600 hover:bg-brand-50"
                    style={{ height: 13, width: 13 }}
                  />
                </form>
                <span className={`chip flex-shrink-0 px-1 py-0 text-[10px] ${PRIORITY_CHIP[t.priority] ?? PRIORITY_CHIP[4]}`}>
                  P{t.priority}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-800">{t.title}</span>
                {t.assigned_to && (
                  <span className="flex-shrink-0 text-[10px] text-brand-600">{t.assigned_to}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Feed */}
      <div className="card px-3 py-2">
        <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Team feed</div>
        {!feed || feed.length === 0 ? (
          <p className="text-xs text-slate-400">Quiet.</p>
        ) : (
          <ul className="space-y-1.5">
            {feed.map((d, i) => {
              const p = d.payload as { text?: string; by?: string };
              return (
                <li key={i} className="text-xs leading-snug text-slate-700">
                  <span className={"chip mr-1 px-1 py-0 text-[10px] " + (d.kind === "broadcast" ? "bg-amber-50 text-amber-700" : "bg-brand-50 text-brand-700")}>
                    {d.kind === "broadcast" ? "B" : "D"}
                  </span>
                  {p.text}
                  <span className="text-[10px] text-slate-400"> · {p.by} · {timeAgo(d.at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="mt-3 text-center text-[10px] text-slate-300">
        DevBrain widget · updates live
      </p>
    </main>
  );
}
