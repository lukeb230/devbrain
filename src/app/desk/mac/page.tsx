import { redirect } from "next/navigation";
import { sendTestAlert } from "@/app/settings/org/alert-actions";
import { operatorOrgId } from "@/lib/alerts";
import { installationWritePerms } from "@/lib/github-writer";
import { currentOrg, hasRole } from "@/lib/org";
import { currentUser, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { writeGranted } from "@/lib/writer-gates";
import { DeskNext } from "../desk-next";
import { IpcProbe } from "../ipc-probe";
import { Reading } from "../panes";
import { Dot } from "../ui";
import { AppSettings, NotificationSettings } from "./mac-settings";

// ============================================================================
// Desk · This Mac (Dusk) — the preferences page. Left: Notifications (the
// panel's prefs, edited here). Right: App (appearance, Dock, login, Reminders
// sync, updates, setup) and Install health — the server-side half of
// `devbrain doctor` (the same checks /api/v1/health answers).
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskMac() {
  const supabase = await supabaseServer();
  const user = await currentUser();
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
    operatorOrgId()
  ]);
  const at = tick?.updated_at ? new Date(tick.updated_at) : null;
  const age = at ? Math.round((Date.now() - at.getTime()) / 1000) : null;
  const tickOk = age !== null && age < 600;
  const jOn = new Set((jpol ?? []).filter((p) => p.enabled).map((p) => p.repo_id));
  const installIds = [...new Set((repos ?? []).map((r) => r.installation_id).filter((x): x is number => Boolean(x)))];
  const perms = new Map(await Promise.all(installIds.map(async (id) => [id, await installationWritePerms(id)] as const)));
  const recent = (tokens ?? []).filter((t) => t.last_used_at && Date.now() - new Date(t.last_used_at).getTime() < 15 * 60_000);
  const isAdmin = hasRole(org.role, "admin");

  const Health = ({ level, title, sub, right, first }: { level: "go" | "wait" | "stop" | "dim"; title: string; sub: string; right?: React.ReactNode; first?: boolean }) => (
    <div className={`flex items-center gap-3 py-[11px] ${first ? "" : "border-t border-line"}`}>
      <Dot level={level} />
      <div className="flex-1">
        <div className="text-[13.5px] text-txt">{title}</div>
        <div className="mt-0.5 text-[12px] text-muted">{sub}</div>
      </div>
      {right}
    </div>
  );

  return (
    <>
      <Reading className="mx-auto max-w-[980px]">
        <div className="mb-6">
          <h1 className="font-display text-[30px] font-bold leading-none tracking-[-.03em] text-txt">This Mac</h1>
          <p className="mt-2 text-[13px] text-muted">Preferences for this machine · anything set here is live in the panel immediately</p>
        </div>
        <div className="grid grid-cols-2 gap-9">
          <div>
            <NotificationSettings testForm={isAdmin ? <form action={sendTestAlert} className="inline"><DeskNext /><button className="font-display text-[12px] font-semibold text-accent hover:underline">Send a test notification →</button></form> : undefined} />
          </div>
          <div>
            <AppSettings />
            <section className="mt-8">
              <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
                <h3 className="m-0 font-display text-[14px] font-semibold text-txt">Install health</h3>
                <span className="ml-auto font-mono text-[10px] uppercase tracking-[.12em] text-faint">same checks as devbrain doctor</span>
              </div>
              <Health first level={tickOk ? "go" : "stop"} title="Agent tick" sub={at ? `last heartbeat ${age}s ago · every 2 minutes` : "no heartbeat recorded"} right={<span className={`font-mono text-[11px] ${tickOk ? "text-go" : "text-stop"}`}>{tickOk ? "ok" : "stale"}</span>} />
              <Health level={process.env.ANTHROPIC_API_KEY ? "go" : "wait"} title="AI units" sub={process.env.ANTHROPIC_API_KEY ? "reviews, journals, digests, spec extraction run" : "no API key on the server — deterministic units only"} />
              <Health level={recent.length ? "go" : "dim"} title="Your tokens in use" sub={recent.length ? recent.map((t) => t.label).join(", ") : "none used in the last 15 minutes"} right={<span className="font-mono text-[11px] text-muted">{(tokens ?? []).length} live</span>} />
              {(repos ?? []).map((r) => {
                const p = r.installation_id ? perms.get(r.installation_id) ?? null : null;
                const w = writeGranted(p);
                return <Health key={r.id} level={w ? "go" : "wait"} title={r.full_name} sub={`GitHub write access ${w ? "granted" : "pending approval"} · session journals ${jOn.has(r.id) ? "on" : "off"}`} />;
              })}
              <Health level={(teamOpen ?? 0) > 0 ? "wait" : "go"} title="Alerts" sub={`${teamOpen ?? 0} open for this team${operator === org.orgId ? ` · ${opsOpen ?? 0} ops alerts (this team operates the deployment)` : ""} · delivered as native notifications`} />
            </section>
            <IpcProbe />
          </div>
        </div>
      </Reading>
    </>
  );
}
