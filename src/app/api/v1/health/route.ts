import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

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
  });
}
