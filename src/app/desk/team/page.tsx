import Link from "next/link";
import { dollars } from "@/lib/billing/plans";
import { loadBilling } from "@/lib/billing/usage";
import { redirect } from "next/navigation";
import { leaveOrg } from "@/app/settings/members/actions";
import { deleteOrg, renameOrg, setOverageLimit } from "@/app/settings/org/actions";
import { dismissAlert, sendTestAlert } from "@/app/settings/org/alert-actions";
import { operatorOrgId } from "@/lib/alerts";
import { teamHints } from "@/lib/desk/team-hints";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { Reading, TeamPane } from "../panes";
import { ACTION_MUTED, Button, Dot, Empty, Field, LinkButton, Section } from "../ui";

const APP_SLUG = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

// ============================================================================
// Desk · Team settings (Dusk) — Name, AI usage today (display numeral + bar),
// Leave, Delete on the left; Alerts (explanation, test notification, recent
// list with dismiss) on the right. Link a repo in the header.
// ============================================================================

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = { trialing: "trial", active: "active", past_due: "payment failed", canceled: "canceled", comped: "complimentary" };
function Counter({ label, value, of, hint, tone }: { label: string; value: number | string; of: number | string; hint: string; tone?: "stop" }) {
  const over = typeof value === "number" && typeof of === "number" && value > of;
  return (
    <div className="flex items-baseline gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
      <div className="w-[118px] flex-shrink-0 font-mono text-[10.5px] uppercase leading-[1.35] tracking-[.08em] text-faint">{label}</div>
      <div className="flex min-w-0 flex-1 items-baseline gap-1.5 whitespace-nowrap"><span className={`font-display text-[24px] font-medium leading-none ${tone === "stop" || over ? "text-stop" : "text-txt"}`}>{value}</span><span className="text-[12px] text-muted">of {of}</span></div>
      <div className="text-right text-[11px] leading-[1.35] text-muted">{hint}</div>
    </div>
  );
}

export default async function DeskTeam({ searchParams }: { searchParams: Promise<{ error?: string; linked?: string }> }) {
  const sp = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/?from=desk");
  const isOwner = hasRole(me.role, "owner");
  const isAdmin = hasRole(me.role, "admin");
  const admin = supabaseAdmin();
  const [{ count: repoCount }, { count: memberCount }, { count: ownerCount }, { data: orgRow }, billing, { data: recentAlerts }, operator, hints] = await Promise.all([
    admin.from("linked_repos").select("id", { count: "exact", head: true }).eq("org_id", me.orgId).is("unlinked_at", null),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner"),
    admin.from("orgs").select("ai_daily_cap, plan").eq("id", me.orgId).single(),
    loadBilling(me.orgId),
    admin.from("alert_log").select("id, severity, title, count, last_seen, resolved_at").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(20),
    operatorOrgId(),
    teamHints(me.orgId, me.userId, null),
  ]);
  const soleOwner = isOwner && (ownerCount ?? 0) <= 1;

  return (
    <>
      <TeamPane current="team" hints={hints} />
      <Reading>
        <div className="flex items-end gap-4">
          <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Team settings</h1>
          {isAdmin && <a href={`https://github.com/apps/${APP_SLUG}/installations/new`} className="ml-auto" title="Install the DevBrain GitHub App on a repo; it appears here when GitHub sends us back"><LinkButton>Link a repo</LinkButton></a>}
        </div>
        <p className="mt-2 text-[13px] text-muted">{me.orgName} · {repoCount ?? 0} repo{repoCount === 1 ? "" : "s"} · {memberCount ?? 0} member{memberCount === 1 ? "" : "s"} · plan {billing?.plan.name ?? orgRow?.plan ?? "—"}{operator === me.orgId ? " · this team operates the deployment" : ""} · members, roles and invite links live on <Link href="/desk/members" className="text-accent hover:underline">Members</Link></p>
        {sp.linked && <p className="mt-4 rounded-[10px] border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-3.5 py-2.5 text-[13px] text-go">Repo linked. Pick it from the repo switcher above.</p>}

        <div className="mt-6 grid grid-cols-2 gap-7">
          <div>
            <Section className="" title="Name">
              {isOwner ? (
                <form action={renameOrg} className="mt-2.5 flex gap-2"><DeskNext /><Field name="name" defaultValue={me.orgName} required className="min-w-0 flex-1" /><Button tone="ghost" size="lg">Save</Button></form>
              ) : (
                <p className="mt-2.5 text-[13px] text-txt">{me.orgName} <span className="text-faint">· owners rename</span></p>
              )}
            </Section>

            <section className="mt-7 rounded-xl border border-line bg-row px-5 py-[18px]">
              <div className="flex items-baseline"><h3 className="m-0 font-display text-[18px] font-medium text-txt">Plan &amp; usage</h3><span className="ml-auto font-mono text-[10.5px] text-faint">{billing ? `${billing.plan.name} · ${STATUS_LABEL[billing.status] ?? billing.status}` : "—"}</span></div>
              {billing && (
                <>
                  <div className="mt-3">
                    <Counter label="seats this month" value={billing.usage.seatsUsed} of={billing.plan.seats} hint={billing.usage.seatsUsed > billing.plan.seats ? `${billing.usage.seatsUsed - billing.plan.seats} extra · ${dollars(billing.plan.extraSeatCents)} each` : "included"} />
                    <Counter label="actions today" value={billing.usage.actionsToday} of={billing.plan.actionsPerDay} hint={billing.usage.actionsToday >= billing.plan.actionsPerDay ? "past the allowance — overage" : "resets 00:00 UTC"} />
                    <Counter label="overage this period" value={dollars(billing.overageCents)} of={billing.overageLimitCents === null ? "no limit" : dollars(billing.overageLimitCents)} hint={`${billing.usage.overageActions} actions · ${dollars(billing.plan.extraActionCents)} each`} tone={billing.overageExhausted ? "stop" : undefined} />
                  </div>
                  <p className="mt-3 text-[12.5px] leading-[1.6] text-muted">
                    {!billing.entitled
                      ? "This team's plan has lapsed: reviews, journals and digests are off and new tokens can't be minted. Presence, collisions, tasks and handoffs keep working."
                      : billing.overageExhausted
                        ? "Overage limit reached — reviews, journals and digests pause until the period ends. Raise the limit below or upgrade the plan. Presence, collisions, tasks and handoffs keep running."
                        : "A seat is anyone — or any spawned session — with a session this period. Actions are reviews, journals, digests, standups and matching; past the daily allowance they run as overage until the limit."}
                  </p>
                  {isAdmin && billing.overageLimitCents !== null && (
                    <form action={setOverageLimit} className="mt-3 flex items-center gap-2">
                      <DeskNext />
                      <span className="text-[12.5px] text-muted">Overage limit</span>
                      <Field name="limit" defaultValue={String(billing.overageLimitCents / 100)} mono className="w-24" />
                      <span className="text-[12.5px] text-muted">USD / period · 0 pauses at the allowance</span>
                      <Button tone="ghost">Save</Button>
                    </form>
                  )}
                </>
              )}
            </section>

            <Section title="Leave this team">
              <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">{soleOwner ? "You're the only owner — make someone else an owner on Members before leaving." : "Your dev tokens for this team are revoked when you leave."}</p>
              {!soleOwner && <form action={leaveOrg} className="mt-2.5"><DeskNext /><Button tone="ghost">Leave team</Button></form>}
            </Section>

            {isOwner && (
              <Section title="Delete this team" tone="stop">
                <p className="mb-2.5 mt-2 text-[12.5px] leading-[1.6] text-muted">Deletes every repo link, task, journal and record for {me.orgName}. Type the team name to confirm.</p>
                <form action={deleteOrg} className="flex gap-2">
                  <DeskNext />
                  <Field name="confirm" placeholder={me.orgName} mono className="min-w-0 flex-1" />
                  <Button tone="danger" size="lg">Delete team</Button>
                </form>
              </Section>
            )}
          </div>

          <Section className="" title="Alerts" hint="native notifications · admins">
            <p className="mb-3 mt-2 text-[12.5px] leading-[1.6] text-muted">When something breaks for the team — a repo losing GitHub access, the AI budget running out, a sync error — owners and admins get a macOS notification from the app and a banner on Home. Nothing to configure; turn it off per Mac under <Link href="/desk/mac" className="text-accent hover:underline">This Mac</Link>.</p>
            {isAdmin && <form action={sendTestAlert}><DeskNext /><Button tone="ghost">Send a test notification</Button></form>}
            <div className="mt-4">
              {(recentAlerts ?? []).length === 0 ? (
                <Empty className="border-t border-line">No alerts so far.</Empty>
              ) : (
                (recentAlerts ?? []).map((a) => (
                  <div key={a.id} className={`flex items-center gap-3 border-t border-line py-3 ${a.resolved_at ? "text-faint" : ""}`}>
                    <Dot level={a.resolved_at ? "dim" : a.severity === "error" ? "stop" : a.severity === "warn" ? "wait" : "go"} size={8} glow={false} />
                    <div className="flex-1">
                      <div className={`text-[13.5px] ${a.resolved_at ? "" : "text-txt"}`}>{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</div>
                      <div className={`mt-0.5 font-mono text-[11px] ${a.resolved_at ? "" : "text-muted"}`}>{new Date(a.last_seen).toLocaleString()}{a.resolved_at ? " · resolved" : ""}</div>
                    </div>
                    {!a.resolved_at && isAdmin && <form action={dismissAlert}><DeskNext /><input type="hidden" name="id" value={a.id} /><button className={ACTION_MUTED}>dismiss</button></form>}
                  </div>
                ))
              )}
            </div>
          </Section>
        </div>
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </Reading>
    </>
  );
}
