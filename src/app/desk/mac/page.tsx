import { redirect } from "next/navigation";
import { operatorOrgId } from "@/lib/alerts";
import { installationWritePerms } from "@/lib/github-writer";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { writeGranted } from "@/lib/writer-gates";
import { IpcProbe } from "../ipc-probe";
import { Card, Empty, PageTitle, Row } from "../ui";

// ============================================================================
// Desk · This Mac — the server-side half of `devbrain doctor` (the same
// checks /api/v1/health answers), the app bridge, and where the Mac-side
// preferences live. Dock / login / update toggles need new app commands and
// land with the phase-5 app build; until then the tray menu has them.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskMac() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const admin = supabaseAdmin();

  const [{ data: tick }, { data: repos }, { data: jpol }, { data: tokens }, { count: opsOpen }, { count: teamOpen }, operator] = await Promise.all([
    admin.from("system_state").select("value, updated_at").eq("key", "last_tick").maybeSingle(),
    admin.from("linked_repos").select("id, full_name, installation_id").eq("org_id", org.orgId).is("unlinked_at", null),
    admin.from("policies").select("repo_id, enabled").eq("org_id", org.orgId).eq("rule", "journals"),
    supabase.from("dev_tokens").select("id, label, last_used_at").is("revoked_at", null),
    admin.from("alert_log").select("id", { count: "exact", head: true }).is("org_id", null).is("resolved_at", null),
    admin.from("alert_log").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).is("resolved_at", null),
    operatorOrgId(),
  ]);
  const at = tick?.updated_at ? new Date(tick.updated_at) : null;
  const age = at ? Math.round((Date.now() - at.getTime()) / 1000) : null;
  const tickOk = age !== null && age < 600;
  const jOn = new Set((jpol ?? []).filter((p) => p.enabled).map((p) => p.repo_id));
  const installIds = [...new Set((repos ?? []).map((r) => r.installation_id).filter((x): x is number => Boolean(x)))];
  const perms = new Map(await Promise.all(installIds.map(async (id) => [id, await installationWritePerms(id)] as const)));
  const recent = (tokens ?? []).filter((t) => t.last_used_at && Date.now() - new Date(t.last_used_at).getTime() < 15 * 60_000);

  return (
    <>
      <PageTitle title="This Mac" sub="Install health and app preferences." />
      <Card title="Health" right="the same checks as devbrain doctor">
        <Row dot={tickOk ? "go" : "stop"} title="Agent tick" sub={at ? `last heartbeat ${age}s ago · every 2 minutes` : "no heartbeat recorded"} right={<span className={"font-mono text-[10.5px] " + (tickOk ? "text-go" : "text-stop")}>{tickOk ? "ok" : "stale"}</span>} />
        <Row dot={process.env.ANTHROPIC_API_KEY ? "go" : "wait"} title="AI units" sub={process.env.ANTHROPIC_API_KEY ? "reviews, journals, digests, spec extraction run" : "no API key on the server — deterministic units only"} />
        <Row dot={recent.length ? "go" : "dim"} title="Your tokens in use" sub={recent.length ? recent.map((t) => t.label).join(", ") : "none used in the last 15 minutes"} right={<span className="font-mono text-[10.5px] text-muted">{(tokens ?? []).length} live</span>} />
        {(repos ?? []).map((r) => {
          const p = r.installation_id ? perms.get(r.installation_id) ?? null : null;
          const w = writeGranted(p);
          return (
            <Row key={r.id} dot={w ? "go" : "wait"} title={r.full_name} sub={`GitHub write access ${w ? "granted" : "pending approval"} · session journals ${jOn.has(r.id) ? "on" : "off"}`} />
          );
        })}
        <Row dot={(teamOpen ?? 0) > 0 ? "wait" : "go"} title="Alerts" sub={`${teamOpen ?? 0} open for this team${operator === org.orgId ? ` · ${opsOpen ?? 0} ops alerts (this team operates the deployment)` : ""} · delivered as native notifications`} />
      </Card>

      <Card title="App" right="from the tray menu until the next app build">
        <Row title="Show in Dock" sub="Off by default — the menu-bar brain is home. While the Desk is open the app shows a Dock icon and menu bar, then returns to menu-bar-only when you close it." right={<span className="font-mono text-[10.5px] text-faint">tray ▸ Show in Dock</span>} />
        <Row title="Launch at login" sub="Keeps presence, notifications and Reminders sync running." right={<span className="font-mono text-[10.5px] text-faint">tray ▸ Launch at login</span>} />
        <Row title="Check for updates" sub="Runs devbrain update: CLI, plugin, jobs and the app bundle. A new build starts on the next launch." right={<span className="font-mono text-[10.5px] text-faint">tray ▸ Check for updates…</span>} />
        <Row title="Theme · notifications" sub="Set in the panel's Settings; the Desk follows the panel." right={<span className="font-mono text-[10.5px] text-faint">panel ▸ ⚙</span>} />
        {!operator && <Empty>No operator team set for this deployment.</Empty>}
      </Card>

      <IpcProbe />
    </>
  );
}
