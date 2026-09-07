import Link from "next/link";
import { redirect } from "next/navigation";
import { createClaim, releaseClaim } from "@/app/dashboard/[repoId]/claim-actions";
import { leaveHandoff, pickupHandoff, sendBroadcast } from "@/app/dashboard/[repoId]/handoff-actions";
import { startTask } from "@/app/dashboard/[repoId]/tasks/actions";
import { dismissAlert } from "@/app/settings/org/alert-actions";
import { loadTeamSnapshot } from "@/lib/desk/load";
import { buildNeeds } from "@/lib/desk/needs-you";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "./desk-next";
import { ExternalLink } from "./external-link";
import { Pulse } from "@/app/widget/pulse";
import { Button, Card, Empty, Field, PageTitle, Row, Select } from "./ui";

// ============================================================================
// Desk · Home — the Needs-you inbox, who's working, claimed areas, open
// handoffs, today's standup, and the quick actions. Built on the SAME loader
// and Needs-you builder as the panel (phase-4 rule 4), so the two surfaces
// show the same list.
// ============================================================================

export const dynamic = "force-dynamic";

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
const initials = (n: string) => n.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "?";
const act = "font-display text-[11.5px] font-semibold text-brand-400 hover:underline";

export default async function DeskHome({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  // The layout redirects when signed out, but Next renders pages in parallel
  // with layouts — so this page must not assume a team either.
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repoRows } = await supabase.from("linked_repos").select("id").eq("org_id", org.orgId).is("unlinked_at", null);
  const scope = await deskScope(sp, (repoRows ?? []).map((r) => r.id));
  const data = await loadTeamSnapshot({ supabase, user, org, lastRepoId: scope.repoId, notice: sp.error ?? null });
  const isMe = (name: string | null | undefined) => Boolean(data.self && name && name.toLowerCase() === data.self.toLowerCase());
  const needs = buildNeeds({ self: data.self, scopeAll: data.scopeAll, prs: data.prs, tasks: data.tasks, claims: data.claims, collisions: data.collisions, handoffs: data.handoffs, fmtAgo: timeAgo });
  const open = data.tasks.filter((t) => t.status === "open");
  const hourAgo = Date.now() - 3600_000;
  const peopleLastHour = new Set(data.activity.filter((a) => new Date(a.at).getTime() > hourAgo).map((a) => a.dev_label ?? "")).size;
  const to = (route: string) => withScope(`/desk${route}`, scope);

  // Presence grouped by root identity — spawned sessions fold under their parent.
  const groups = new Map<string, typeof data.sessions>();
  for (const s of data.sessions) {
    const k = (s.root ?? s.dev_label).toLowerCase();
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(s);
  }

  const repo = data.lastRepo; // quick actions need a repo; the loader picks the scoped one or the first

  return (
    <>
      <PageTitle
        title="Home"
        sub={`${org.orgName} · ${data.scopeAll ? "all repos" : data.lastRepo?.name ?? "one repo"} · signed in as ${org.login}`}
        right={
          repo && (
            <>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line2 px-3 py-1.5 font-display text-[11.5px] font-semibold text-muted hover:text-txt">📣 Broadcast</summary>
                <form action={sendBroadcast} className="absolute right-0 z-10 mt-1 flex w-[360px] flex-col gap-1.5 rounded-xl border border-line2 bg-row p-3 shadow-[var(--wg-shadow)]">
                  <DeskNext />
                  <input type="hidden" name="repoId" value={repo.id} />
                  <Field name="text" required placeholder="Every live Claude and the feed see it" />
                  <div className="flex items-center justify-between"><span className="text-[10.5px] text-faint">reaches every active session within one turn</span><Button>Send</Button></div>
                </form>
              </details>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line2 px-3 py-1.5 font-display text-[11.5px] font-semibold text-muted hover:text-txt">Claim a lane</summary>
                <form action={createClaim} className="absolute right-0 z-10 mt-1 flex w-[380px] flex-col gap-1.5 rounded-xl border border-line2 bg-row p-3 shadow-[var(--wg-shadow)]">
                  <DeskNext />
                  <input type="hidden" name="repoId" value={repo.id} />
                  <Field name="paths" required placeholder="Paths, comma-separated (e.g. src/auth/)" />
                  <Field name="note" placeholder="What you're doing" />
                  <div className="flex items-center gap-1.5">
                    <Select name="hours" defaultValue="4"><option value="1">1h</option><option value="2">2h</option><option value="4">4h</option><option value="8">8h</option><option value="24">24h</option></Select>
                    <span className="flex-1 text-[10.5px] text-faint">teammates&apos; Claudes route around it · {repo.name}</span>
                    <Button>Claim</Button>
                  </div>
                </form>
              </details>
            </>
          )
        }
      />

      {data.alerts.length > 0 && (
        <div className="mb-2.5 space-y-1.5">
          {data.alerts.map((a) => (
            <div key={a.id} className={"flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px] " + (a.severity === "error" ? "border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] text-stop" : a.severity === "warn" ? "border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] text-wait" : "border-line bg-row text-txt")}>
              <span className="min-w-0 flex-1 truncate font-medium">{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</span>
              <form action={dismissAlert}><DeskNext /><input type="hidden" name="id" value={a.id} /><button className="opacity-70 hover:opacity-100">dismiss</button></form>
            </div>
          ))}
        </div>
      )}

      <Card title="Needs you" count={needs.length}>
        {needs.length === 0 ? (
          <Empty>Nothing needs you right now.</Empty>
        ) : (
          needs.map((n) => (
            <Row
              key={n.key}
              dot={n.level}
              title={n.title}
              sub={n.why}
              right={
                n.action.kind === "github" ? <ExternalLink href={n.action.url ?? "#"} className={act}>{n.action.label}</ExternalLink>
                : n.action.kind === "tab" ? <Link href={to(n.action.route)} className={act}>{n.action.label}</Link>
                : n.action.kind === "start_task" ? <form action={startTask}><DeskNext /><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.taskId} /><button className={act}>Start</button></form>
                : <form action={pickupHandoff}><DeskNext /><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.handoffId} /><button className={act}>Pick up</button></form>
              }
            />
          ))
        )}
      </Card>

      <div className="mb-2.5 rounded-xl border border-line bg-row pt-1.5">
        <Pulse
          activity={data.activity}
          events={[...data.feed.map((f) => ({ at: f.at, kind: f.kind })), ...data.handoffs.map((h) => ({ at: h.at, kind: "handoff" }))]}
          collision={data.collisions.length > 0}
          people={peopleLastHour}
          prEvents={data.prs.length}
        />
      </div>
      <div className="mb-2.5 grid grid-cols-4 gap-2">
        {[
          { n: data.prs.length, l: "PRs", href: to("/prs"), warn: false },
          { n: data.conflicted, l: data.conflicted === 1 ? "conflict" : "conflicts", href: to("/prs"), warn: data.conflicted > 0 },
          { n: data.collisions.length, l: data.collisions.length === 1 ? "collision" : "collisions", href: to("/prs"), warn: data.collisions.length > 0 },
          { n: open.length, l: "open tasks", href: to("/board"), warn: false },
        ].map((t) => (
          <Link key={t.l} href={t.href} className="rounded-xl border border-line bg-row px-3.5 py-2.5 hover:border-brand-500">
            <div className={"font-mono text-[20px] " + (t.warn ? "text-stop" : "text-txt")}>{t.n}</div>
            <div className="text-[11px] text-muted">{t.l}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
        <Card title="Now working" count={data.sessions.length}>
          {groups.size === 0 ? (
            <Empty>Nobody active right now.</Empty>
          ) : (
            [...groups.values()].map((g) => {
              const lead = g[0];
              const name = lead.root ?? lead.dev_label;
              const busy = g.find((s) => s.summary) ?? lead;
              return (
                <Row
                  key={lead.id}
                  dot="go"
                  title={<span className={isMe(name) ? "text-brand-400" : ""}>{isMe(name) ? "you" : name}{g.length > 1 ? <span className="ml-1 font-mono text-[10px] text-brand-400">×{g.length}</span> : null}</span>}
                  sub={busy.summary || (data.scopeAll ? lead.repo : timeAgo(lead.last_seen))}
                  right={<span className="flex h-6 w-6 items-center justify-center rounded-md bg-row2 font-mono text-[10px] text-muted">{initials(name)}</span>}
                />
              );
            })
          )}
        </Card>
        <Card title="Claimed areas" count={data.claims.length}>
          {data.claims.length === 0 ? (
            <Empty>No lanes claimed.</Empty>
          ) : (
            data.claims.map((c) => (
              <Row
                key={c.id}
                title={<span className={isMe(c.dev_label) ? "text-brand-400" : ""}>{isMe(c.dev_label) ? "you" : c.dev_label}{data.scopeAll ? <span className="ml-1 text-faint">· {c.repo}</span> : null}</span>}
                sub={`${c.paths.join(", ")}${c.note ? ` — ${c.note}` : ""}${c.expires_at ? ` · ${Math.max(0, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 3600_000))}h left` : ""}`}
                right={<form action={releaseClaim}><DeskNext /><input type="hidden" name="repoId" value={c.repo_id} /><input type="hidden" name="id" value={c.id} /><button className={act}>Release</button></form>}
              />
            ))
          )}
        </Card>
      </div>

      <div className="grid grid-cols-[1fr_1fr] gap-2.5">
        <Card title="Open handoffs" count={data.handoffs.length} right={repo && <details><summary className="cursor-pointer list-none text-brand-400 hover:underline">Leave a handoff</summary><form action={leaveHandoff} className="mt-2 flex flex-col gap-1.5 text-left"><DeskNext /><input type="hidden" name="repoId" value={repo.id} /><Field name="branch" placeholder="Branch (optional)" /><Field name="summary" required placeholder="What's done" /><Field name="remaining" placeholder="What remains, any warnings" /><div className="text-right"><Button>Leave handoff</Button></div></form></details>}>
          {data.handoffs.length === 0 ? (
            <Empty>No open handoffs.</Empty>
          ) : (
            data.handoffs.map((h) => (
              <Row
                key={h.id}
                dot="wait"
                title={`${h.by ?? "someone"}${h.branch ? ` · ${h.branch}` : ""}${data.scopeAll ? ` · ${h.repo}` : ""}`}
                sub={`${h.summary}${h.remaining ? ` — remaining: ${h.remaining}` : ""}`}
                right={!isMe(h.by) && <form action={pickupHandoff}><DeskNext /><input type="hidden" name="repoId" value={h.repo_id} /><input type="hidden" name="id" value={h.id} /><button className={act}>Pick up</button></form>}
              />
            ))
          )}
        </Card>
        <Card title={data.digest ? `Standup · ${data.digest.repo}` : "Standup"} right={data.digest?.day}>
          {data.digest ? <p className="whitespace-pre-line text-[12.5px] leading-relaxed text-txt">{data.digest.body}</p> : <Empty>No standup yet — the daily digest writes one after the team has been active.</Empty>}
        </Card>
      </div>

      {data.notice && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({data.notice}). Only team admins can do some of these.</p>}
    </>
  );
}
