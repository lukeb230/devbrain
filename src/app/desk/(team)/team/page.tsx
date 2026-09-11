import Link from "next/link";
import { loadBilling } from "@/lib/billing/usage";
import { Counter, STATUS_LABEL } from "../plan/counters";
import { redirect } from "next/navigation";
import { leaveOrg } from "@/app/settings/members/actions";
import { deleteOrg, renameOrg } from "@/app/settings/org/actions";
import { dismissAlert, sendTestAlert } from "@/app/settings/org/alert-actions";
import { operatorOrgId } from "@/lib/alerts";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DeskNext } from "../../desk-next";
import { Reading } from "../../panes";
import { ACTION_MUTED, Button, Dot, Empty, Field, LinkButton, Section } from "../../ui";

const APP_SLUG = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

// ============================================================================
// Desk · Team settings (Dusk) — Name, AI usage today (display numeral + bar),
// Leave, Delete on the left; Alerts (explanation, test notification, recent
// list with dismiss) on the right. Link a repo in the header.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskTeam({ searchParams }: { searchParams: Promise<{ error?: string; linked?: string }> }) {
  const sp = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/?from=desk");
  const isOwner = hasRole(me.role, "owner");
  const isAdmin = hasRole(me.role, "admin");
  const admin = supabaseAdmin();
  const [{ count: repoCount }, { count: memberCount }, { count: ownerCount }, { data: orgRow }, billing, { data: recentAlerts }, operator] = await Promise.all([
    admin.from("linked_repos").select("id", { count: "exact", head: true }).eq("org_id", me.orgId).is("unlinked_at", null),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner"),
    admin.from("orgs").select("ai_daily_cap, plan").eq("id", me.orgId).single(),
    loadBilling(me.orgId),
    admin.from("alert_log").select("id, severity, title, count, last_seen, resolved_at").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(20),
    operatorOrgId()
  ]);
  const soleOwner = isOwner && (ownerCount ?? 0) <= 1;

  return (
    <>
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
              <div className="flex items-baseline"><h3 className="m-0 font-display text-[18px] font-medium text-txt">Plan</h3><span className="ml-auto font-mono text-[10.5px] text-faint">{billing ? `${billing.plan.name} · ${STATUS_LABEL[billing.status] ?? billing.status}` : "—"}</span></div>
              {billing && (
                <div className="mt-3">
                  <Counter label="seats this period" value={billing.usage.seatsUsed} of={billing.plan.seats} hint={billing.usage.seatsUsed > billing.plan.seats ? `${billing.usage.seatsUsed - billing.plan.seats} extra` : "included"} />
                  <Counter label="actions today" value={billing.usage.actionsToday} of={billing.plan.actionsPerDay} hint={billing.usage.actionsToday >= billing.plan.actionsPerDay ? "past the allowance — overage" : "resets 00:00 UTC"} />
                </div>
              )}
              <p className="mt-3 text-[12.5px] leading-[1.6] text-muted">Invoice estimate, upgrades, billing details and the overage limit live on <Link href="/desk/plan" className="text-accent hover:underline">Plan</Link>.</p>
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
