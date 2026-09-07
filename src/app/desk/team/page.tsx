import { redirect } from "next/navigation";
import { leaveOrg } from "@/app/settings/members/actions";
import { deleteOrg, renameOrg } from "@/app/settings/org/actions";
import { dismissAlert, sendTestAlert } from "@/app/settings/org/alert-actions";
import { operatorOrgId } from "@/lib/alerts";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { Button, Card, Empty, Field, PageTitle, Row } from "../ui";

const APP_SLUG = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

// ============================================================================
// Desk · Team settings — name, AI usage today, alerts (native notifications;
// recent list with dismiss; test notification), leave, delete. Team switching
// lives in the title bar. Same actions as the dashboard's Team page.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskTeam({ searchParams }: { searchParams: Promise<{ error?: string; linked?: string }> }) {
  const sp = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/?from=desk");
  const isOwner = hasRole(me.role, "owner");
  const isAdmin = hasRole(me.role, "admin");
  const admin = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: repoCount }, { count: memberCount }, { count: ownerCount }, { data: orgRow }, { data: usage }, { data: recentAlerts }, operator] = await Promise.all([
    admin.from("linked_repos").select("id", { count: "exact", head: true }).eq("org_id", me.orgId).is("unlinked_at", null),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner"),
    admin.from("orgs").select("ai_daily_cap, plan").eq("id", me.orgId).single(),
    admin.from("ai_usage").select("calls, input_tokens, output_tokens").eq("org_id", me.orgId).eq("day", today).maybeSingle(),
    admin.from("alert_log").select("id, severity, title, count, last_seen, resolved_at").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(20),
    operatorOrgId(),
  ]);
  const cap = orgRow?.ai_daily_cap ?? 0;
  const calls = usage?.calls ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((calls / cap) * 100)) : 0;
  const soleOwner = isOwner && (ownerCount ?? 0) <= 1;

  return (
    <>
      <PageTitle title="Team settings" sub={`${me.orgName} · ${repoCount ?? 0} repo${repoCount === 1 ? "" : "s"} · ${memberCount ?? 0} member${memberCount === 1 ? "" : "s"} · plan ${orgRow?.plan ?? "beta"}${operator === me.orgId ? " · this team operates the deployment" : ""}`}
        right={isAdmin ? <a href={`https://github.com/apps/${APP_SLUG}/installations/new`} className="rounded-lg bg-brand-500 px-3 py-1.5 font-display text-[11.5px] font-semibold text-white hover:bg-brand-400" title="Install the DevBrain GitHub App on a repo; it appears here when GitHub sends us back">Link a repo</a> : undefined}
      />
      {sp.linked && <p className="mb-3 rounded-lg border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-3 py-1.5 text-[12px] text-go">Repo linked. Pick it from the repo switcher above.</p>}

      <Card title="Name">
        {isOwner ? (
          <form action={renameOrg} className="flex items-center gap-2"><DeskNext /><Field name="name" defaultValue={me.orgName} required /><Button tone="ghost">Save</Button></form>
        ) : (
          <p className="text-[12.5px]">{me.orgName} <span className="text-faint">· owners rename</span></p>
        )}
      </Card>

      <Card title="AI usage today" right={`resets 00:00 UTC`}>
        <div className="text-[12.5px]">{calls} of {cap} calls · {Number(usage?.input_tokens ?? 0).toLocaleString()} in / {Number(usage?.output_tokens ?? 0).toLocaleString()} out tokens</div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-line2"><div className={"h-full " + (pct >= 100 ? "bg-stop" : pct >= 80 ? "bg-wait" : "bg-brand-500")} style={{ width: `${pct}%` }} /></div>
        <p className="mt-1.5 text-[11px] text-muted">{pct >= 100 ? "Budget spent — reviews, journals and digests pause for this team until midnight UTC. Presence, collisions and merge lights keep running." : "Reviews, journals, spec extraction and the daily digest count. Presence and lights never do."}</p>
      </Card>

      <Card title="Alerts" right="native notifications · admins">
        <p className="mb-1.5 text-[11.5px] text-muted">When something breaks for the team — a repo losing GitHub access, the AI budget running out, a sync error — owners and admins get a macOS notification from the app and a banner on Home. Nothing to configure; turn it off per Mac under the panel&apos;s notification settings.</p>
        {isAdmin && <form action={sendTestAlert} className="mb-2"><DeskNext /><Button tone="ghost">Send a test notification</Button></form>}
        {(recentAlerts ?? []).length === 0 ? (
          <Empty>No alerts so far.</Empty>
        ) : (
          (recentAlerts ?? []).map((a) => (
            <Row
              key={a.id}
              dot={a.resolved_at ? "dim" : a.severity === "error" ? "stop" : a.severity === "warn" ? "wait" : "go"}
              title={<span className={a.resolved_at ? "text-muted" : ""}>{a.title}{a.count > 1 ? ` (×${a.count})` : ""}</span>}
              sub={new Date(a.last_seen).toLocaleString()}
              right={!a.resolved_at && isAdmin && <form action={dismissAlert}><DeskNext /><input type="hidden" name="id" value={a.id} /><button className="font-display text-[11.5px] font-semibold text-muted hover:text-txt">dismiss</button></form>}
            />
          ))
        )}
      </Card>

      <Card title="Leave this team">
        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span className="flex-1">{soleOwner ? "You're the only owner — make someone else an owner on Members before leaving." : "Your dev tokens for this team are revoked when you leave."}</span>
          {!soleOwner && <form action={leaveOrg}><DeskNext /><Button tone="ghost">Leave team</Button></form>}
        </div>
      </Card>

      {isOwner && (
        <Card title="Delete this team">
          <form action={deleteOrg} className="flex items-center gap-2 text-[12px] text-muted">
            <DeskNext />
            <span className="flex-1">Deletes every repo link, task, journal and record for {me.orgName}. Type the team name to confirm.</span>
            <Field name="confirm" placeholder={me.orgName} className="max-w-[220px] font-mono" />
            <Button tone="danger">Delete team</Button>
          </form>
        </Card>
      )}
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
