import Link from "next/link";
import { redirect } from "next/navigation";
import { PrBadges } from "@/components/PrBadges";
import { supabaseServer } from "@/lib/supabase/server";
import { LiveAll } from "./live-all";

export const dynamic = "force-dynamic";

// Team home — mission control across every linked repo: who's working right
// now, every open PR with full status, collisions, and the decision stream.

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: repos }, { data: sessions }, { data: prs }, { data: branches }, { data: activity }, { data: decisions }] =
    await Promise.all([
      supabase.from("linked_repos").select("id, full_name, default_branch, is_vault").order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, branch, agent_kind, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, head_branch, review_state, draft, mergeable_state, changed_files, html_url, updated_at").eq("state", "open").order("updated_at", { ascending: false }),
      supabase.from("branches").select("repo_id, name, changed_files, merged_at").is("merged_at", null),
      supabase.from("activity").select("repo_id, session_id, file, at").gte("at", activeSince).order("at", { ascending: false }).limit(150),
      supabase.from("events").select("repo_id, kind, payload, at").eq("kind", "decision").order("at", { ascending: false }).limit(8),
    ]);

  const repoById = new Map((repos ?? []).map((r) => [r.id, r]));
  const filesBySession = new Map<string, string[]>();
  for (const a of activity ?? []) {
    const key = String(a.session_id ?? "");
    if (!filesBySession.has(key)) filesBySession.set(key, []);
    const list = filesBySession.get(key)!;
    if (!list.includes(a.file) && list.length < 6) list.push(a.file);
  }

  // Org-wide collisions: same file on 2+ unmerged branches of the same repo.
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
      if (bs.length > 1)
        collisions.push({ repo: repoById.get(repoId)?.full_name ?? "?", file, branches: bs });
    }
  }

  const appSlug = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">DevBrain</h1>
          <LiveAll />
        </div>
        <div className="flex items-center gap-4 text-sm">
          <a href={`https://github.com/apps/${appSlug}/installations/new`} className="text-slate-400 hover:text-white">+ Link repo</a>
          <Link href="/settings/tokens" className="text-slate-400 hover:text-white">Dev tokens</Link>
          <form action="/auth/sign-out" method="post">
            <button className="text-slate-400 hover:text-white">Sign out</button>
          </form>
        </div>
      </header>

      {collisions.length > 0 && (
        <section className="panel mb-6 border-amber-500/50">
          <h2 className="mb-2 text-sm font-semibold text-amber-400">⚠ Collisions across branches</h2>
          <ul className="space-y-1 text-sm text-slate-300">
            {collisions.map((c) => (
              <li key={c.repo + c.file}>
                <span className="text-slate-500">{c.repo}:</span>{" "}
                <code className="text-amber-300">{c.file}</code> on {c.branches.join(" and ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Now working</h2>
        {!sessions || sessions.length === 0 ? (
          <p className="text-sm text-slate-500">No active sessions anywhere right now.</p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((s) => (
              <li key={s.id} className="flex items-start gap-3">
                <span className="mt-1.5 h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-emerald-400" />
                <div className="min-w-0">
                  <span className="font-medium text-slate-200">{s.dev_label}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {repoById.get(s.repo_id)?.full_name}
                    {s.branch ? ` · ${s.branch}` : ""} · {s.agent_kind} · {timeAgo(s.last_seen)}
                  </span>
                  {s.summary && (
                    <div className="text-sm text-brand-400/90">“{s.summary}”</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(filesBySession.get(String(s.id)) ?? []).map((f) => (
                      <code key={f} className="rounded bg-ink-800 px-1.5 py-0.5 text-xs text-brand-400">{f}</code>
                    ))}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel mb-6">
        <h2 className="mb-3 text-lg font-semibold text-white">Open pull requests — everywhere</h2>
        {!prs || prs.length === 0 ? (
          <p className="text-sm text-slate-500">No open PRs across any repo.</p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {prs.map((pr) => {
              const repo = repoById.get(pr.repo_id);
              return (
                <li key={pr.repo_id + pr.number} className="py-3">
                  <a href={pr.html_url ?? "#"} target="_blank" className="font-medium text-brand-400 hover:text-brand-500">
                    #{pr.number} {pr.title}
                  </a>
                  <PrBadges pr={pr} defaultBranch={repo?.default_branch ?? "main"} />
                  <div className="mt-0.5 text-xs text-slate-500">
                    {repo?.full_name} · {pr.author} · {pr.head_branch} · {((pr.changed_files as string[]) ?? []).length} files · {timeAgo(pr.updated_at)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="panel">
          <h2 className="mb-3 text-lg font-semibold text-white">Repositories</h2>
          <ul className="divide-y divide-ink-700">
            {(repos ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2.5">
                <Link href={`/dashboard/${r.id}`} className="font-medium text-brand-400 hover:text-brand-500">
                  {r.full_name}
                </Link>
                <span className="flex gap-3 text-xs">
                  <Link href={`/dashboard/${r.id}/brain`} className="text-slate-400 hover:text-white">🧠 brain</Link>
                  <Link href={`/dashboard/${r.id}/rules`} className="text-slate-400 hover:text-white">rules</Link>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel">
          <h2 className="mb-3 text-lg font-semibold text-white">Recent decisions</h2>
          {!decisions || decisions.length === 0 ? (
            <p className="text-sm text-slate-500">
              None logged yet. Claudes log decisions via the plugin&apos;s{" "}
              <code className="rounded bg-ink-800 px-1">log_decision</code> tool; they land here for everyone.
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {decisions.map((d, i) => (
                <li key={i} className="text-slate-300">
                  {(d.payload as { text?: string })?.text}
                  <span className="ml-2 text-xs text-slate-500">
                    {repoById.get(d.repo_id ?? "")?.full_name ?? ""} · {timeAgo(d.at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
