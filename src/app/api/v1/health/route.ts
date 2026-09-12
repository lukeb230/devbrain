import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/api-guard";
import { supabaseAdmin } from "@/lib/supabase/server";
import { installationWritePerms } from "@/lib/github-writer";
import { operatorOrgId } from "@/lib/alerts";
import { writeGranted } from "@/lib/writer-gates";

// ============================================================================
// Health — GET /api/v1/health · Auth: Bearer <dev token>.
// Answers "is the server-side machinery alive?" for `devbrain doctor`:
//   - agent tick: last heartbeat written by /api/agents/tick (pg_cron, 2 min)
//   - agent: whether an Anthropic key is configured (AI units run at all)
// Never throws; a missing heartbeat is reported, not errored.
// ============================================================================

const TICK_STALE_S = 10 * 60;

export async function GET(request: Request) {
  const auth = await apiAuth(request);
  if ("denied" in auth) return auth.denied;

  const admin = supabaseAdmin();
  const { data } = await admin.from("system_state").select("value, updated_at").eq("key", "last_tick").maybeSingle();
  const [{ count: opsOpen }, { count: orgOpen }, operator, { data: watchdogJob }] = await Promise.all([
    admin.from("alert_log").select("id", { count: "exact", head: true }).is("org_id", null).is("resolved_at", null),
    admin.from("alert_log").select("id", { count: "exact", head: true }).eq("org_id", auth.org_id).is("resolved_at", null),
    operatorOrgId(),
    // The Postgres watchdog opens an ops alert when the tick dies; its open
    // row (if any) is the only trace it leaves.
    admin.from("alert_log").select("id").is("org_id", null).eq("key", "watchdog.tick").is("resolved_at", null).maybeSingle(),
  ]);
  // Journals are per-repo and default OFF — the one feature whose "off"
  // state used to be indistinguishable from a bug. Name each repo's state.
  const [{ data: repos }, { data: jpol }] = await Promise.all([
    admin.from("linked_repos").select("id, full_name, installation_id").eq("org_id", auth.org_id).is("unlinked_at", null),
    admin.from("policies").select("repo_id, enabled").eq("org_id", auth.org_id).eq("rule", "journals"),
  ]);
  const jOn = new Set((jpol ?? []).filter((p) => p.enabled).map((p) => p.repo_id));
  const journals = {
    enabled: (repos ?? []).filter((r) => jOn.has(r.id)).map((r) => r.full_name),
    disabled: (repos ?? []).filter((r) => !jOn.has(r.id)).map((r) => r.full_name),
  };
  // One app: can each repo's installation write? (GitHub keeps an install on
  // its old grants until the owner approves the app's new permissions.) One
  // call per distinct installation.
  const installIds = [...new Set((repos ?? []).map((r) => r.installation_id).filter((x): x is number => Boolean(x)))];
  const permsById = new Map(await Promise.all(installIds.map(async (id) => [id, await installationWritePerms(id)] as const)));
  const github_write = (repos ?? []).map((r) => {
    const p = r.installation_id ? permsById.get(r.installation_id) ?? null : null;
    return { repo: r.full_name, granted: writeGranted(p), contents: p?.contents ?? null, pull_requests: p?.pull_requests ?? null };
  });
  const at = data?.updated_at ? new Date(data.updated_at) : null;
  const age_s = at ? Math.round((Date.now() - at.getTime()) / 1000) : null;

  return NextResponse.json({
    ok: age_s !== null && age_s < TICK_STALE_S,
    tick: {
      last_at: at?.toISOString() ?? null,
      age_s,
      stale_after_s: TICK_STALE_S,
      last_result: data?.value ?? null,
    },
    agent_configured: Boolean(process.env.ANTHROPIC_API_KEY),
    journals,
    github_write,
    alerts: {
      delivery: "native", // the Mac app watches alert_log; no webhooks exist
      ops_open: opsOpen ?? 0,
      team_open: orgOpen ?? 0,
      operator_set: Boolean(operator),
      this_team_is_operator: operator === auth.org_id,
      tick_dead_alert_open: Boolean(watchdogJob),
    },
  });
}
