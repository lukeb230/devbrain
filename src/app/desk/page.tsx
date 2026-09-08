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
import { Pulse } from "@/app/widget/pulse";
import { DeskNext } from "./desk-next";
import { ExternalLink } from "./external-link";
import { Greeting } from "./greeting";
import { ListPane, PaneTitle, Reading } from "./panes";
import { ACTION, Avatar, Banner, Button, Card, Empty, Field, HostTag, Popover, Section, SectionHead, Select } from "./ui";

// ============================================================================
// Desk · Home (Dusk). List pane: Needs you (cards with a 3px status edge) and
// Now working. Reading pane: date + greeting, the three quick actions as
// popovers, alert banners, four counters, the pulse card, Claimed areas +
// Open handoffs two-up, the standup. Same loader and Needs-you builder as
// the panel, so both surfaces show the same list.
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
const EDGE = { stop: "border-l-stop", wait: "border-l-wait", go: "border-l-go" } as const;

export default async function DeskHome({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
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

  const NeedAction = ({ n }: { n: (typeof needs)[number] }) =>
    n.action.kind === "github" ? <ExternalLink href={n.action.url ?? "#"} className={`mt-1.5 inline-block ${ACTION}`}>{n.action.label}</ExternalLink>
    : n.action.kind === "tab" ? <Link href={to(n.action.route)} className={`mt-1.5 inline-block ${ACTION}`}>{n.action.label}</Link>
    : n.action.kind === "start_task" ? <form action={startTask} className="mt-1.5"><DeskNext /><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.taskId} /><button className={ACTION}>Start</button></form>
    : <form action={pickupHandoff} className="mt-1.5"><DeskNext /><input type="hidden" name="repoId" value={n.action.repoId} /><input type="hidden" name="id" value={n.action.handoffId} /><button className={ACTION}>Pick up</button></form>;

  return (
    <>
      <ListPane title="Needs you" count={needs.length}>
        {needs.length === 0 ? (
          <p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">Nothing needs you right now.</p>
        ) : (
          needs.map((n, i) => (
            <div key={n.key} className={`mx-2 rounded-lg border-l-[3px] px-3 py-2.5 ${EDGE[n.level]} ${n.level === "stop" ? "border border-line bg-row" : ""} ${i > 0 ? "mt-1.5" : ""}`}>
              <div className="text-[13px] font-medium text-txt">{n.title}</div>
              <div className="mt-0.5 text-[11.5px] leading-[1.45] text-muted">{n.why}</div>
              <NeedAction n={n} />
            </div>
          ))
        )}
        <PaneTitle count={data.sessions.length}>Now working</PaneTitle>
        {groups.size === 0 ? (
          <p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">Nobody active right now. Presence appears within a turn of a teammate starting a session.</p>
        ) : (
          [...groups.values()].map((g) => {
            const lead = g[0];
            const name = lead.root ?? lead.dev_label;
            const busy = g.find((s) => s.summary) ?? lead;
            const me = isMe(name);
            return (
              <div key={lead.id} className="flex items-center gap-2.5 px-4 py-2">
                <Avatar name={name} me={me} dot badge={g.length > 1 ? `×${g.length}` : undefined} />
                <div className="min-w-0 flex-1">
                  <div className={`flex items-baseline gap-1.5 text-[13px] ${me ? "text-accent2" : "text-txt"}`}><span className="truncate">{me ? "you" : name}</span><HostTag hosts={g.map((s) => s.agent)} /></div>
                  <div className="truncate text-[11px] text-muted">{busy.summary || (data.scopeAll ? lead.repo : timeAgo(lead.last_seen))}</div>
                </div>
              </div>
            );
          })
        )}
      </ListPane>

      <Reading>
        <div className="flex items-end gap-4">
          <Greeting login={org.login} />
          {repo && (
            <div className="ml-auto flex gap-2">
              <Popover label="Broadcast" width={360}>
                <form action={sendBroadcast} className="flex flex-col gap-2">
                  <DeskNext />
                  <input type="hidden" name="repoId" value={repo.id} />
                  <Field name="text" required placeholder="Every live Claude and the feed see it" ground="ink" autoFocus />
                  <div className="flex items-center justify-between"><span className="text-[11.5px] text-faint">reaches every active session within one turn</span><Button>Send</Button></div>
                </form>
              </Popover>
              <Popover label="Claim a lane" width={400}>
                <form action={createClaim} className="flex flex-col gap-2">
                  <DeskNext />
                  <input type="hidden" name="repoId" value={repo.id} />
                  <Field name="paths" required placeholder="Path prefix, e.g. src/auth/ (comma-separated for more)" ground="ink" autoFocus />
                  <Field name="note" placeholder="What you're doing" ground="ink" />
                  <div className="flex items-center gap-2">
                    <Select name="hours" defaultValue="4" ground="ink" size="sm"><option value="1">1h</option><option value="2">2h</option><option value="4">4h</option><option value="8">8h</option><option value="24">24h</option></Select>
                    <span className="flex-1 text-[11.5px] text-faint">teammates&apos; Claudes route around it · {repo.name}</span>
                    <Button>Claim</Button>
                  </div>
                </form>
              </Popover>
              <Popover label="Leave a handoff" width={420}>
                <form action={leaveHandoff} className="flex flex-col gap-2">
                  <DeskNext />
                  <input type="hidden" name="repoId" value={repo.id} />
                  <Field name="branch" placeholder="Branch (optional)" ground="ink" mono />
                  <Field name="summary" required placeholder="What's done" ground="ink" autoFocus />
                  <Field name="remaining" placeholder="What remains, any warnings" ground="ink" />
                  <div className="text-right"><Button>Leave handoff</Button></div>
                </form>
              </Popover>
            </div>
          )}
        </div>

        {data.alerts.map((a) => (
          <Banner key={a.id} tone={a.severity === "error" ? "stop" : "wait"} className="mt-6" right={<form action={dismissAlert}><DeskNext /><input type="hidden" name="id" value={a.id} /><button className="text-[12px] text-current opacity-80 hover:opacity-100">dismiss</button></form>}>
            <b>{a.title}</b>{a.count > 1 ? ` (×${a.count})` : ""}
          </Banner>
        ))}

        <div className="mt-7 grid grid-cols-4 gap-3.5">
          {[
            { n: data.prs.length, l: data.prs.length === 1 ? "open pull request" : "open pull requests", href: to("/prs"), warn: false },
            { n: data.conflicted, l: data.conflicted === 1 ? "conflict" : "conflicts", href: to("/prs"), warn: data.conflicted > 0 },
            { n: data.collisions.length, l: data.collisions.length === 1 ? "collision" : "collisions", href: to("/prs"), warn: data.collisions.length > 0 },
            { n: open.length, l: "open tasks", href: to("/board"), warn: false },
          ].map((t) => (
            <Link key={t.l} href={t.href} className="rounded-xl border border-line bg-row px-[18px] py-4 hover:border-line3">
              <div className={`font-display text-[36px] font-medium leading-none ${t.warn ? "text-stop" : "text-txt"}`}>{t.n}</div>
              <div className="mt-1 text-[12px] text-muted">{t.l}</div>
            </Link>
          ))}
        </div>

        <div className="mt-7">
          <Pulse
            variant="desk"
            activity={data.activity}
            events={[...data.feed.map((f) => ({ at: f.at, kind: f.kind })), ...data.handoffs.map((h) => ({ at: h.at, kind: "handoff" }))]}
            collision={data.collisions.length > 0}
            people={peopleLastHour}
            prEvents={data.prs.length}
          />
        </div>

        <div className="mt-7 grid grid-cols-2 gap-7">
          <Section className="" title="Claimed areas" count={data.claims.length}>
            {data.claims.length === 0 ? (
              <Empty className="mt-2.5">No lanes claimed.</Empty>
            ) : (
              data.claims.map((c, i) => (
                <div key={c.id} className={`flex items-center gap-3 border-t border-line py-2.5 ${i === 0 ? "mt-2.5" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className={`text-[13.5px] ${isMe(c.dev_label) ? "text-accent2" : "text-txt"}`}>
                      {isMe(c.dev_label) ? "you" : c.dev_label}
                      {c.expires_at && <span className="text-faint"> · {Math.max(0, Math.round((new Date(c.expires_at).getTime() - Date.now()) / 3600_000))}h left</span>}
                      {data.scopeAll && <span className="text-faint"> · {c.repo}</span>}
                    </div>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-muted">{c.paths.join(", ")}{c.note ? ` — ${c.note}` : ""}</div>
                  </div>
                  <form action={releaseClaim}><DeskNext /><input type="hidden" name="repoId" value={c.repo_id} /><input type="hidden" name="id" value={c.id} /><button className={ACTION}>Release</button></form>
                </div>
              ))
            )}
          </Section>
          <Section className="" title="Open handoffs" count={data.handoffs.length}>
            {data.handoffs.length === 0 ? (
              <Empty className="mt-2.5">No open handoffs.</Empty>
            ) : (
              data.handoffs.map((h, i) => (
                <div key={h.id} className={`border-t border-line py-2.5 ${i === 0 ? "mt-2.5" : ""}`}>
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] text-txt">{h.by ?? "someone"}{h.branch && <span className="font-mono text-[11px] text-muted"> · {h.branch}</span>}{data.scopeAll && <span className="font-mono text-[11px] text-muted"> · {h.repo}</span>}</div>
                      <div className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">{h.summary}{h.remaining && <i className="text-wait"> Remaining: {h.remaining}</i>}</div>
                    </div>
                    {!isMe(h.by) && <form action={pickupHandoff}><DeskNext /><input type="hidden" name="repoId" value={h.repo_id} /><input type="hidden" name="id" value={h.id} /><button className={ACTION}>Pick up</button></form>}
                  </div>
                </div>
              ))
            )}
          </Section>
        </div>

        <Card pad="lg" className="mt-7">
          <SectionHead title={data.digest ? `Standup · ${data.digest.repo}` : "Standup"} right={data.digest ? <span className="font-mono text-[10.5px]">{data.digest.day} · written by the agent tick</span> : undefined} />
          {data.digest ? (
            <p className="mt-2.5 max-w-[620px] whitespace-pre-line font-display text-[16px] leading-[1.65] text-body">{data.digest.body}</p>
          ) : (
            <Empty className="mt-1">No standup yet — the daily digest writes one after the team has been active.</Empty>
          )}
        </Card>

        {data.notice && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({data.notice}). Only team admins can do some of these.</p>}
      </Reading>
    </>
  );
}
