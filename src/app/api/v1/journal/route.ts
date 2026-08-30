import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Session journal intake — POST /api/v1/journal · Auth: Bearer <dev token>.
//
// The plugin's SessionEnd hook posts a REDACTED excerpt of the session
// transcript (assistant text, tool names, file paths — never tool results).
// This route only queues it; the agent tick summarises one row per run into
// `journals`, which is org-wide visible and labelled with the author.
//
// Body: { repo, session_id?, branch?, task_id?, dirty?, excerpt, plugin_version? }
// Feature-flagged per repo: policies.rule='journals' must be enabled (default
// off) — otherwise a 200 with queued:false and the reason, so /health and
// `doctor` can show the feature is off rather than silently missing.
// ============================================================================

const MAX_EXCERPT = 48_000;

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.repo || typeof body.excerpt !== "string") {
    return NextResponse.json({ error: "repo and excerpt required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(body.repo).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .is("unlinked_at", null)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const { data: policy } = await admin
    .from("policies")
    .select("enabled")
    .eq("repo_id", repo.id)
    .eq("rule", "journals")
    .maybeSingle();
  // Off is the default. Say so, instead of a bodyless 204 that reads as
  // success: an inert flagship feature must be distinguishable from a bug.
  if (!policy?.enabled) {
    return NextResponse.json({ ok: true, queued: false, reason: "journals are disabled for this repo — enable them under Rules" });
  }

  const excerpt = body.excerpt.trim();
  if (excerpt.length < 200) return NextResponse.json({ ok: true, queued: false, reason: "too short" });

  const uuid = (v: unknown) =>
    typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v) ? v : null;

  const { error } = await admin.from("journal_queue").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    session_id: uuid(body.session_id),
    user_id: auth.user_id,
    dev_label: auth.label,
    branch: typeof body.branch === "string" ? body.branch.slice(0, 200) : null,
    task_id: uuid(body.task_id),
    dirty: Boolean(body.dirty),
    excerpt: excerpt.slice(0, MAX_EXCERPT),
    plugin_version: typeof body.plugin_version === "string" ? body.plugin_version.slice(0, 20) : null,
  });
  if (error) return NextResponse.json({ error: "queue insert failed" }, { status: 500 });
  return NextResponse.json({ ok: true, queued: true });
}
