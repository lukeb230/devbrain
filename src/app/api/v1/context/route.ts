import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Context digest — injected into Claude Code sessions at SessionStart.
// GET /api/v1/context?repo=owner/name  ·  Auth: Bearer <dev token>.
// Returns a compact, agent-readable digest: open PRs, active sessions and
// their recent files, claims, collision warnings.
// ============================================================================

const ACTIVE_WINDOW_MIN = 15;

export async function GET(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const repoName = new URL(request.url).searchParams.get("repo");
  if (!repoName) {
    return NextResponse.json({ error: "repo required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id, full_name")
    .eq("full_name", repoName)
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) {
    return NextResponse.json({ error: "repo not linked" }, { status: 404 });
  }

  const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();

  const [prs, sessions, activity, claims] = await Promise.all([
    admin
      .from("prs")
      .select("number, title, author, head_branch, review_state, draft, changed_files, html_url")
      .eq("repo_id", repo.id)
      .eq("state", "open")
      .order("updated_at", { ascending: false }),
    admin
      .from("sessions")
      .select("id, dev_label, branch, summary, last_seen")
      .eq("repo_id", repo.id)
      .is("ended_at", null)
      .gte("last_seen", since),
    admin
      .from("activity")
      .select("session_id, dev_label:user_id, branch, file, at")
      .eq("repo_id", repo.id)
      .gte("at", since)
      .order("at", { ascending: false })
      .limit(200),
    admin
      .from("claims")
      .select("dev_label, paths, note, expires_at")
      .eq("repo_id", repo.id)
      .is("released_at", null),
  ]);

  // Group active files per session.
  const filesBySession = new Map<string, Set<string>>();
  for (const a of activity.data ?? []) {
    const key = String(a.session_id ?? "unknown");
    if (!filesBySession.has(key)) filesBySession.set(key, new Set());
    filesBySession.get(key)!.add(a.file);
  }

  const activeSessions = (sessions.data ?? []).map((s) => ({
    dev: s.dev_label,
    branch: s.branch,
    summary: s.summary,
    files: [...(filesBySession.get(String(s.id)) ?? [])],
  }));

  // Collision detection: same file in two different active sessions,
  // or same file in two open PRs' changed_files.
  const collisions: string[] = [];
  const seen = new Map<string, string>();
  for (const s of activeSessions) {
    for (const f of s.files) {
      const prev = seen.get(f);
      if (prev && prev !== s.dev) {
        collisions.push(`${f} — being edited by both ${prev} and ${s.dev} right now`);
      }
      seen.set(f, s.dev);
    }
  }
  const prFiles = new Map<string, number[]>();
  for (const pr of prs.data ?? []) {
    for (const f of (pr.changed_files as string[]) ?? []) {
      if (!prFiles.has(f)) prFiles.set(f, []);
      prFiles.get(f)!.push(pr.number);
    }
  }
  for (const [file, nums] of prFiles) {
    if (nums.length > 1) {
      collisions.push(`${file} — modified in PRs #${nums.join(", #")}`);
    }
  }

  return NextResponse.json({
    repo: repo.full_name,
    generated_at: new Date().toISOString(),
    open_prs: (prs.data ?? []).map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      branch: p.head_branch,
      review_state: p.review_state,
      draft: p.draft,
    })),
    active_sessions: activeSessions,
    claims: claims.data ?? [],
    collisions,
  });
}
