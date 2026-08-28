import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Presence ingest — called by Claude Code hooks + git hooks via the CLI.
// Body: { repo: "owner/name", branch, file?, tool, kind: "activity"|"session_start"|"session_end", summary? }
// Auth: Bearer <dev token>.
// ============================================================================

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.repo) {
    return NextResponse.json({ error: "repo required" }, { status: 400 });
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
  if (!repo) {
    return NextResponse.json({ error: "repo not linked" }, { status: 404 });
  }

  const kind = body.kind ?? "activity";

  if (kind === "session_start") {
    const { data: session } = await admin
      .from("sessions")
      .insert({
        org_id: repo.org_id,
        repo_id: repo.id,
        user_id: auth.user_id,
        dev_label: auth.label,
        branch: body.branch ?? null,
        summary: body.summary ?? null,
        agent_kind: body.agent ?? "claude-code",
      })
      .select("id")
      .single();
    return NextResponse.json({ ok: true, session_id: session?.id });
  }

  if (kind === "session_update") {
    // A Claude announcing what it's working on — the live intent layer.
    if (!body.session_id) {
      return NextResponse.json({ error: "session_id required" }, { status: 400 });
    }
    await admin
      .from("sessions")
      .update({
        summary: String(body.summary || "").slice(0, 200) || null,
        last_seen: new Date().toISOString(),
        ended_at: null,
      })
      .eq("id", body.session_id)
      .eq("org_id", repo.org_id);
    return NextResponse.json({ ok: true });
  }

  if (kind === "session_end") {
    await admin
      .from("sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", body.session_id)
      .eq("org_id", repo.org_id);
    return NextResponse.json({ ok: true });
  }

  // Default: activity event.
  if (!body.file) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }
  // Snapshot the session's live status phrase ("adding light/dark mode") onto
  // the activity row — this is what makes the feed human-readable. The phrase
  // is captured at edit time, so a later focus change starts a new group.
  let label: string | null = null;
  if (body.session_id) {
    const { data: s } = await admin
      .from("sessions")
      .select("summary")
      .eq("id", body.session_id)
      .single();
    label = s?.summary ?? null;
  }
  await admin.from("activity").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    session_id: body.session_id ?? null,
    user_id: auth.user_id,
    branch: body.branch ?? null,
    file: body.file,
    tool: body.tool ?? "edit",
    dev_label: auth.label,
    label,
  });
  if (body.session_id) {
    // Activity proves the session is alive — refresh last_seen and clear any
    // premature ended_at (resilience against misfired end hooks).
    await admin
      .from("sessions")
      .update({
        last_seen: new Date().toISOString(),
        branch: body.branch ?? null,
        ended_at: null,
      })
      .eq("id", body.session_id);
  }
  return NextResponse.json({ ok: true });
}
