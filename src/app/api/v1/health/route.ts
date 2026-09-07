import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";
import { installationWritePerms } from "@/lib/github-writer";
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
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = supabaseAdmin();
  const { data } = await admin.from("system_state").select("value, updated_at").eq("key", "last_tick").maybeSingle();
  const [{ count: opsOpen }, { count: orgOpen }, { count: opsChannels }, { count: orgChannels }, { data: wd }] = await Promise.all([
    admin.from("alert_log").select("id", { count: "exact", head: true }).is("org_id", null).is("resolved_at", null),
    admin.from("alert_log").select("id", { count: "exact", head: true }).eq("org_id", auth.org_id).is("resolved_at", null),
    admin.from("alert_channels").select("id", { count: "exact", head: true }).is("org_id", null).eq("enabled", true),
    admin.from("alert_channels").select("id", { count: "exact", head: true }).eq("org_id", auth.org_id).eq("enabled", true),
    admin.from("system_state").select("value").eq("key", "ops_webhook").maybeSingle(),
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
      ops_open: opsOpen ?? 0,
      team_open: orgOpen ?? 0,
      ops_channel: Boolean(process.env.DEVBRAIN_OPS_WEBHOOK) || (opsChannels ?? 0) > 0,
      team_channels: orgChannels ?? 0,
      watchdog: Boolean((wd?.value as { url?: string } | null)?.url),
    },
  });
}
