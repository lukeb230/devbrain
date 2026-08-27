import { NextResponse } from "next/server";
import { buildDigest } from "@/lib/digest";
import type { MemoryHit } from "@/lib/memory";
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

  const params = new URL(request.url).searchParams;
  const repoName = params.get("repo");
  // Optional: the user's current prompt. When present, the top team-memory
  // hits ride along as relevant_history (Phase 2a). Absent → key absent.
  const q = (params.get("q") ?? "").trim().slice(0, 500);
  if (!repoName) {
    return NextResponse.json({ error: "repo required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id, full_name")
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(repoName).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) {
    return NextResponse.json({ error: "repo not linked" }, { status: 404 });
  }

  const since = new Date(Date.now() - ACTIVE_WINDOW_MIN * 60_000).toISOString();

  const [prs, sessions, activity, claims, policies, decisions, broadcasts, tasks, handoffs] = await Promise.all([
    admin
      .from("prs")
      .select("number, title, author, head_branch, review_state, mergeable_state, draft, changed_files, html_url")
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
      .select("id, dev_label, paths, note, expires_at")
      .eq("repo_id", repo.id)
      .is("released_at", null)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    admin
      .from("policies")
      .select("rule, enabled")
      .eq("repo_id", repo.id),
    admin
      .from("events")
      .select("payload, at")
      .eq("repo_id", repo.id)
      .eq("kind", "decision")
      .order("at", { ascending: false })
      .limit(10),
    admin
      .from("events")
      .select("payload, at")
      .eq("repo_id", repo.id)
      .eq("kind", "broadcast")
      .gte("at", new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .order("at", { ascending: false })
      .limit(10),
    admin
      .from("tasks")
      .select("id, title, detail, priority, tags, created_by, created_at, assigned_to, started_by, footprint")
      .eq("repo_id", repo.id)
      .eq("status", "open")
      .order("priority")
      .order("created_at")
      .limit(15),
    admin
      .from("handoffs")
      .select("id, dev_label, branch, task_id, summary, done, remaining, warnings, created_at")
      .eq("repo_id", repo.id)
      .is("picked_up_at", null)
      .order("created_at", { ascending: false })
      .limit(8),
  ]);

  // Rows for stale-brain detection (last 72h of merges), the latest standup
  // digest, and AI reviews for open PRs. Assembly happens in lib/digest.ts.
  const { data: mergedBranches } = await admin
    .from("branches")
    .select("name, changed_files, merged_at")
    .eq("repo_id", repo.id)
    .gte("merged_at", new Date(Date.now() - 72 * 3600_000).toISOString());
  const { data: mergedPrs } = await admin
    .from("prs")
    .select("number, title, head_branch")
    .eq("repo_id", repo.id)
    .neq("state", "open");
  const [digestQ, reviewsQ] = await Promise.all([
    admin.from("digests").select("day, body").eq("repo_id", repo.id).order("day", { ascending: false }).limit(1),
    admin
      .from("pr_reviews")
      .select("pr_number, head_sha, verdict, summary")
      .eq("repo_id", repo.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  let relevantHistory: MemoryHit[] | undefined;
  if (q.length >= 12) {
    // Prompts are natural language → 'any' mode (OR of terms, ranked by
    // how many match) so a long question still finds the one relevant note.
    const { data } = await admin.rpc("memory_search", { p_repo: repo.id, p_q: q, p_limit: 3, p_mode: "any" });
    // OR-mode ranks by how many terms matched; a hit far below the best one
    // is usually a single stray word. Keep only hits within 25% of the top.
    const hits = (data ?? []) as MemoryHit[];
    const top = hits[0]?.rank ?? 0;
    relevantHistory = hits.filter((h) => (h.rank ?? 0) >= top * 0.25);
  }

  return NextResponse.json(
    buildDigest({
      repo: repo.full_name,
      you: auth.label,
      prs: prs.data ?? [],
      sessions: sessions.data ?? [],
      activity: activity.data ?? [],
      claims: claims.data ?? [],
      policies: policies.data ?? [],
      decisions: decisions.data ?? [],
      broadcasts: broadcasts.data ?? [],
      tasks: tasks.data ?? [],
      handoffs: handoffs.data ?? [],
      mergedBranches: mergedBranches ?? [],
      mergedPrs: mergedPrs ?? [],
      latestDigest: (digestQ.data ?? [])[0] ?? null,
      reviews: reviewsQ.data ?? [],
      relevantHistory,
    }),
  );
}
