import Link from "next/link";
import { redirect } from "next/navigation";
import { ActivityFeed } from "@/components/ActivityFeed";
import { AppNav } from "@/components/AppNav";
import { PrBadges } from "@/components/PrBadges";
import { currentOrg } from "@/lib/org";
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

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ unlinked?: string; deleted?: string }>;
}) {
  const { unlinked: justUnlinked, deleted: justDeleted } = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ data: repos }, { data: sessions }, { data: prs }, { data: branches }, { data: activity }, { data: decisions }, { data: topTasks }] =
    await Promise.all([
      supabase.from("linked_repos").select("id, full_name, default_branch, is_vault").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, branch, agent_kind, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, head_branch, review_state, draft, mergeable_state, changed_files, html_url, updated_at").eq("state", "open").order("updated_at", { ascending: false }),
      supabase.from("branches").select("repo_id, name, changed_files, merged_at").is("merged_at", null),
      supabase.from("activity").select("repo_id, session_id, dev_label, label, branch, file, tool, at").gte("at", new Date(Date.now() - 24 * 3600_000).toISOString()).order("at", { ascending: false }).limit(300),
      supabase.from("events").select("repo_id, kind, payload, at").in("kind", ["decision", "broadcast", "rule_change", "bot_write"]).order("at", { ascending: false }).limit(12),
      supabase.from("tasks").select("repo_id, id, title, priority").eq("status", "open").order("priority").order("created_at").limit(8),
    ]);
  // Soft-unlinked repos: history kept, hidden from every list. Reinstalling
  // the GitHub App on one relinks it.
  const { data: unlinkedRepos } = await supabase.from("linked_repos").select("full_name, unlinked_at").not("unlinked_at", "is", null).order("unlinked_at", { ascending: false });

  const repoById = new Map((repos ?? []).map((r) => [r.id, r]));
  const filesBySession = new Map<string, string[]>();
  for (const a of activity ?? []) {
    if (a.at < activeSince) continue; // "Now working" chips: last 15 min only
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

  const conflictedPrs = (prs ?? []).filter((p) => p.mergeable_state === "dirty").length;

  const stats = [
    { label: "Working now", value: sessions?.length ?? 0, accent: (sessions?.length ?? 0) > 0 },
    { label: "Open PRs", value: prs?.length ?? 0, accent: false },
    { label: "PR conflicts", value: conflictedPrs, warn: conflictedPrs > 0 },
    { label: "File collisions", value: collisions.length, warn: collisions.length > 0 },
    { label: "Repositories", value: repos?.length ?? 0, accent: false },
  ];

  return (
    <>
      <AppNav
        live={<LiveAll />}
        tabs={(repos ?? []).map((r) => ({
          label: r.full_name.split("/")[1] ?? r.full_name,
          href: `/dashboard/${r.id}`,
        }))}
      />
      <main className="mx-auto max-w-[1440px] px-6 py-6">
        {(justUnlinked || justDeleted) && (
          <p className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
            {justDeleted ? `Deleted ${justDeleted} and everything under it.` : `Unlinked ${justUnlinked} — history kept. Reinstall the GitHub App on it to relink.`}
          </p>
        )}
        {unlinkedRepos && unlinkedRepos.length > 0 && (
          <p className="mb-4 text-xs text-slate-500">
            Unlinked (history kept): {unlinkedRepos.map((r) => r.full_name).join(" · ")} — reinstall the GitHub App on a repo to relink it.
          </p>
        )}
        {(!repos || repos.length === 0) && (
          <section className="card mb-6 border-brand-200 card-pad">
            <div className="card-title mb-1 text-brand-700">Get {org.orgName} running</div>
            <ol className="mt-2 grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
              <li className="rounded-md border border-slate-200 p-3"><b>1. Link a repo.</b> <a href={`https://github.com/apps/${process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain"}/installations/new`} className="text-brand-600 hover:underline">Install the GitHub App</a> on the repos your team works in.</li>
              <li className="rounded-md border border-slate-200 p-3"><b>2. Install the Mac app.</b> It sets up the Claude Code plugin and the CLI on first run — see <Link href="/settings/setup" className="text-brand-600 hover:underline">Setup</Link>.</li>
              <li className="rounded-md border border-slate-200 p-3"><b>3. Invite your team.</b> Mint a link on <Link href="/settings/members" className="text-brand-600 hover:underline">Members</Link>; they sign in with GitHub and repeat step 2.</li>
              <li className="rounded-md border border-slate-200 p-3"><b>4. Work.</b> Presence, collisions, tasks, reviews and journals fill in as sessions run.</li>
            </ol>
          </section>
        )}
        {/* Stat strip */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <div key={s.label} className="card card-pad">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{s.label}</div>
              <div
                className={
                  "mt-1 text-2xl font-semibold tabular-nums " +
                  ("warn" in s && s.warn
                    ? "text-red-600"
                    : "accent" in s && s.accent
                      ? "text-emerald-600"
                      : "text-slate-900")
                }
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>

        {collisions.length > 0 && (
          <div className="card mb-6 border-l-4 border-l-amber-400 card-pad">
            <div className="card-title mb-2 text-amber-700">Collisions across branches</div>
            <ul className="space-y-1 text-sm text-slate-700">
              {collisions.map((c) => (
                <li key={c.repo + c.file}>
                  <span className="text-slate-500">{c.repo}:</span>{" "}
                  <code className="rounded bg-amber-50 px-1 text-amber-800">{c.file}</code> on{" "}
                  {c.branches.join(" and ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-12 gap-6">
          {/* Main column */}
          <div className="col-span-12 space-y-6 lg:col-span-8">
            <section className="card card-pad">
              <h2 className="card-title mb-3">Now working</h2>
              {!sessions || sessions.length === 0 ? (
                <p className="text-sm text-slate-500">No active sessions anywhere right now.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {sessions.map((s) => (
                    <li key={s.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-emerald-500" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium text-slate-900">{s.dev_label}</span>
                          <span className="text-xs text-slate-500">
                            {repoById.get(s.repo_id)?.full_name}
                            {s.branch ? ` · ${s.branch}` : ""} · {s.agent_kind} · {timeAgo(s.last_seen)}
                          </span>
                        </div>
                        {s.summary && (
                          <div className="text-sm text-brand-600">{s.summary}</div>
                        )}
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(filesBySession.get(String(s.id)) ?? []).map((f) => (
                            <code key={f} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">{f}</code>
                          ))}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <h2 className="card-title mb-3">Open pull requests</h2>
              {!prs || prs.length === 0 ? (
                <p className="text-sm text-slate-500">No open PRs across any repo.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {prs.map((pr) => {
                    const repo = repoById.get(pr.repo_id);
                    return (
                      <li key={pr.repo_id + pr.number} className="py-2.5 first:pt-0 last:pb-0">
                        <div className="flex flex-wrap items-center gap-x-2">
                          <a href={pr.html_url ?? "#"} target="_blank" className="font-medium text-slate-900 hover:text-brand-600">
                            <span className="text-slate-400">#{pr.number}</span> {pr.title}
                          </a>
                          <PrBadges pr={pr} defaultBranch={repo?.default_branch ?? "main"} />
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {repo?.full_name} · {pr.author} · {pr.head_branch} · {((pr.changed_files as string[]) ?? []).length} files · {timeAgo(pr.updated_at)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <h2 className="card-title mb-3">Recent work (24h)</h2>
              {!activity || activity.length === 0 ? (
                <p className="text-sm text-slate-500">Nothing yet today.</p>
              ) : (
                <ActivityFeed
                  rows={(activity ?? []).map((a) => ({
                    ...a,
                    repo: repoById.get(a.repo_id)?.full_name ?? null,
                  }))}
                  limit={12}
                />
              )}
            </section>
          </div>

          {/* Rail */}
          <div className="col-span-12 space-y-6 lg:col-span-4">
            <section className="card card-pad">
              <h2 className="card-title mb-3">Repositories</h2>
              <ul className="divide-y divide-slate-100">
                {(repos ?? []).map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2 first:pt-0 last:pb-0">
                    <Link href={`/dashboard/${r.id}`} className="truncate text-sm font-medium text-slate-800 hover:text-brand-600">
                      {r.full_name}
                    </Link>
                    <span className="flex flex-shrink-0 gap-2.5 text-xs">
                      <Link href={`/dashboard/${r.id}/brain`} className="text-slate-500 hover:text-brand-600">Brain</Link>
                      <Link href={`/dashboard/${r.id}/rules`} className="text-slate-500 hover:text-brand-600">Rules</Link>
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card card-pad">
              <h2 className="card-title mb-3">Top tasks</h2>
              {!topTasks || topTasks.length === 0 ? (
                <p className="text-sm text-slate-500">No open tasks. Add them on a repo&apos;s Tasks tab.</p>
              ) : (
                <ul className="space-y-1.5 text-sm">
                  {topTasks.map((t) => (
                    <li key={t.id} className="flex items-baseline gap-2">
                      <span
                        className={
                          "chip flex-shrink-0 " +
                          (t.priority === 1
                            ? "bg-red-50 text-red-700"
                            : t.priority === 2
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-600")
                        }
                      >
                        P{t.priority}
                      </span>
                      <Link
                        href={`/dashboard/${t.repo_id}/tasks`}
                        className="min-w-0 truncate text-slate-700 hover:text-brand-600"
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card card-pad">
              <h2 className="card-title mb-3">Team feed</h2>
              {!decisions || decisions.length === 0 ? (
                <p className="text-sm text-slate-500">
                  Quiet so far. Claudes post here via{" "}
                  <code className="rounded bg-slate-100 px-1">broadcast</code> and{" "}
                  <code className="rounded bg-slate-100 px-1">log_decision</code>.
                </p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {decisions.map((d, i) => {
                    const p = d.payload as { text?: string; by?: string; rule?: string; enabled?: boolean };
                    const chip =
                      d.kind === "broadcast"
                        ? { t: "Broadcast", c: "bg-amber-50 text-amber-700" }
                        : d.kind === "rule_change"
                          ? { t: "Rule", c: "bg-slate-100 text-slate-600" }
                          : d.kind === "bot_write"
                            ? { t: "Bot", c: "bg-violet-50 text-violet-700" }
                            : { t: "Decision", c: "bg-brand-50 text-brand-700" };
                    const text =
                      d.kind === "rule_change"
                        ? `"${p.rule}" turned ${p.enabled ? "on" : "off"} by ${p.by ?? "?"}`
                        : p.text;
                    return (
                      <li key={i}>
                        <div className="flex items-baseline gap-2">
                          <span className={`chip flex-shrink-0 ${chip.c}`}>{chip.t}</span>
                          <span className="text-xs text-slate-400">
                            {p.by && d.kind !== "rule_change" ? `${p.by} · ` : ""}
                            {timeAgo(d.at)}
                          </span>
                        </div>
                        <div className="mt-0.5 text-slate-700">{text}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
