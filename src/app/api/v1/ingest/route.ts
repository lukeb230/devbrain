import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Presence ingest — called by Claude Code hooks + git hooks via the CLI.
// Body: { repo: "owner/name", branch, file?, tool, kind: "activity"|"session_start"|"session_end", summary? }
// Auth: Bearer <dev token>.
// ============================================================================

// A session belongs to the token label that opened it. A teammate is a label
// (several tokens may share one user — the sandbox agents do), so ownership is
// org + label, never user_id alone. Anything else is "not found": a token may
// neither read another label's status phrase nor end its session.
async function ownSession(admin: ReturnType<typeof supabaseAdmin>, id: unknown, orgId: string, label: string) {
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await admin
    .from("sessions")
    .select("id, summary")
    .eq("id", id)
    .eq("org_id", orgId)
    .ilike("dev_label", label.replace(/[%_\\]/g, "\\$&"))
    .maybeSingle();
  return data;
}

const cap = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : null);

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
        branch: cap(body.branch, 200),
        summary: cap(body.summary, 200),
        agent_kind: cap(body.agent, 40) ?? "claude-code",
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
    const own = await ownSession(admin, body.session_id, repo.org_id, auth.label);
    if (!own) return NextResponse.json({ error: "session not found" }, { status: 404 });
    await admin
      .from("sessions")
      .update({
        summary: String(body.summary || "").slice(0, 200) || null,
        last_seen: new Date().toISOString(),
        ended_at: null,
      })
      .eq("id", own.id);
    return NextResponse.json({ ok: true });
  }

  if (kind === "session_end") {
    const own = await ownSession(admin, body.session_id, repo.org_id, auth.label);
    if (!own) return NextResponse.json({ error: "session not found" }, { status: 404 });
    await admin.from("sessions").update({ ended_at: new Date().toISOString() }).eq("id", own.id);
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
  let own: { id: string; summary: string | null } | null = null;
  if (body.session_id) {
    own = await ownSession(admin, body.session_id, repo.org_id, auth.label);
    if (!own) return NextResponse.json({ error: "session not found" }, { status: 404 });
    label = own.summary ?? null;
  }
  await admin.from("activity").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    session_id: own?.id ?? null,
    user_id: auth.user_id,
    branch: cap(body.branch, 200),
    file: String(body.file).slice(0, 500),
    tool: cap(body.tool, 40) ?? "edit",
    dev_label: auth.label,
    label,
  });
  if (own) {
    // Activity proves the session is alive — refresh last_seen and clear any
    // premature ended_at (resilience against misfired end hooks).
    await admin
      .from("sessions")
      .update({
        last_seen: new Date().toISOString(),
        branch: cap(body.branch, 200),
        ended_at: null,
      })
      .eq("id", own.id);
  }
  return NextResponse.json({ ok: true });
}
