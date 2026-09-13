import { NextResponse } from "next/server";
import { apiAuth } from "@/lib/api-guard";
import { guardDecision, type GuardClaim, type GuardSession } from "@/lib/guard";
import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// The collision guard — POST /api/v1/guard  ·  Auth: Bearer <dev token>.
//   body: { repo, rel, session_id?, host?, record? }
//   → { warn: false } | { warn: true, reason, with: [{label, via, id}] }
//
// Called by the plugin's PreToolUse hook before every file-changing tool
// call, inside the hook's 3 s fail-open budget. This is the same single
// round trip the hook used to spend on GET /api/v1/context, with a smaller
// payload — and, when it warns, the decision is recorded as an `events` row
// of kind collision_warned in the same request. The hook stays fail-open:
// any non-200 here means "say nothing".
//
// `record: false` is sent by the Cursor adapter when its sticky denial is
// about to allow the edit silently (the person already replied) — the
// comparison still runs, but a second row for the same warning is not
// written.
// ============================================================================

const ACTIVE_WINDOW_MIN = 15;

export async function POST(request: Request) {
  const auth = await apiAuth(request);
  if ("denied" in auth) return auth.denied;

  const body = await request.json().catch(() => null);
  if (!body || typeof body.repo !== "string" || typeof body.rel !== "string") {
    return NextResponse.json({ error: "repo and rel required" }, { status: 400 });
  }
  const rel = String(body.rel).slice(0, 500);
  const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 80) : "";
  const host = typeof body.host === "string" ? body.host.slice(0, 20) : "claude-code";
  const record = body.record !== false;

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .ilike("full_name", String(body.repo).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .is("unlinked_at", null)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();
  const [{ data: sessions }, { data: activity }, { data: claims }] = await Promise.all([
    admin.from("sessions").select("id, dev_label, branch").eq("repo_id", repo.id).is("ended_at", null).gte("last_seen", since),
    admin.from("activity").select("session_id, file").eq("repo_id", repo.id).eq("file", rel).gte("at", since).limit(200),
    admin
      .from("claims")
      .select("id, dev_label, paths, note")
      .eq("repo_id", repo.id)
      .is("released_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
  ]);

  // Only this file's activity was fetched, so a session's file list is
  // either [rel] or [] — exactly what the decision needs.
  const touched = new Set((activity ?? []).map((a) => String(a.session_id)));
  const guardSessions: GuardSession[] = (sessions ?? []).map((s) => ({
    id: String(s.id),
    dev: String(s.dev_label),
    branch: (s.branch as string | null) ?? null,
    files: touched.has(String(s.id)) ? [rel] : [],
  }));
  const guardClaims: GuardClaim[] = (claims ?? []).map((c) => ({
    id: String(c.id),
    dev_label: String(c.dev_label),
    paths: (c.paths as string[]) ?? [],
    note: (c.note as string | null) ?? null,
  }));

  const decision = guardDecision({ you: auth.label, ownSession: sessionId, rel, sessions: guardSessions, claims: guardClaims });
  if (!decision.warn) return NextResponse.json({ warn: false });

  if (record) {
    await admin.from("events").insert({
      org_id: repo.org_id,
      repo_id: repo.id,
      kind: "collision_warned",
      payload: {
        rel,
        actor: auth.label,
        actor_session: sessionId || null,
        host,
        decision: host === "cursor" ? "deny" : "ask",
        with: decision.with,
      },
    });
  }
  return NextResponse.json({ warn: true, reason: decision.reason, with: decision.with });
}
