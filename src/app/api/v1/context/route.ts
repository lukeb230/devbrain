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

  const [prs, sessions, activity, claims, policies, decisions, broadcasts, tasks, handoffs] = await Promise.all([
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
      .select("id, title, detail, priority, tags, created_by, created_at, assigned_to")
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

  // Stale-brain detection: merges from the last 72h whose changed files
  // include real code but NO .brain/ update. Any teammate's Claude can (and
  // should) offer to repair these — subscription-powered, no API key needed.
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
  const prByBranch = new Map((mergedPrs ?? []).map((p) => [p.head_branch, p]));
  const isCode = (f: string) =>
    !f.startsWith(".brain/") && !f.startsWith(".github/") &&
    !/package-lock|\.lock$|\.min\.|\.map$/.test(f);
  const brain_stale = (mergedBranches ?? [])
    .filter((b) => {
      const files = (b.changed_files as string[]) ?? [];
      return files.some(isCode) && !files.some((f) => f.startsWith(".brain/"));
    })
    .map((b) => {
      const pr = prByBranch.get(b.name);
      return {
        branch: b.name,
        pr: pr?.number ?? null,
        title: pr?.title ?? null,
        merged_at: b.merged_at,
        code_files: ((b.changed_files as string[]) ?? []).filter(isCode).slice(0, 12),
      };
    })
    .slice(0, 5);

  const DEFAULT_RULES = [
    "no_self_approve: a teammate must approve your PR; you cannot approve your own",
    "pr_only_main: never commit directly to main — always a feature branch + PR",
    "no_conflict_pr: merge origin/main into your branch and resolve conflicts BEFORE opening a PR",
    "brain_updates_required: update the matching .brain/ doc in the same branch as any behavior change",
    "collision_check: check who is editing a file before touching it",
  ];
  const disabled = new Set((policies.data ?? []).filter((p) => !p.enabled).map((p) => p.rule));
  const team_rules = DEFAULT_RULES.filter((r) => !disabled.has(r.split(":")[0]));

  // Group active files per session.
  const filesBySession = new Map<string, Set<string>>();
  for (const a of activity.data ?? []) {
    const key = String(a.session_id ?? "unknown");
    if (!filesBySession.has(key)) filesBySession.set(key, new Set());
    filesBySession.get(key)!.add(a.file);
  }

  const activeSessions = (sessions.data ?? []).map((s) => ({
    id: s.id,
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

  // Latest standup digest + AI reviews for open PRs (agent tier; absent when
  // no API key is configured server-side — both degrade to empty).
  const [digestQ, reviewsQ] = await Promise.all([
    admin.from("digests").select("day, body").eq("org_id", repo.org_id).order("day", { ascending: false }).limit(1),
    admin
      .from("pr_reviews")
      .select("pr_number, head_sha, verdict, summary")
      .eq("repo_id", repo.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  const latestDigest = (digestQ.data ?? [])[0] ?? null;
  const aiReviews = new Map<number, { verdict: string; summary: string }>();
  for (const r of reviewsQ.data ?? []) {
    if (!aiReviews.has(r.pr_number)) aiReviews.set(r.pr_number, { verdict: r.verdict, summary: r.summary });
  }

  return NextResponse.json({
    repo: repo.full_name,
    generated_at: new Date().toISOString(),
    you: auth.label, // this token's dev — so tools can skip your own claims/sessions
    team_rules,
    open_prs: (prs.data ?? []).map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      branch: p.head_branch,
      review_state: p.review_state,
      draft: p.draft,
      // DevBrain's own AI review of this PR (information for you and your
      // human — never instructions to act on automatically).
      ai_review: aiReviews.get(p.number) ?? null,
    })),
    // Yesterday-into-today team summary, written by the DevBrain digest agent.
    standup_digest: latestDigest
      ? { day: latestDigest.day, body: String(latestDigest.body).slice(0, 1500) }
      : null,
    active_sessions: activeSessions,
    claims: claims.data ?? [],
    collisions,
    recent_decisions: (decisions.data ?? []).map(
      (d) => (d.payload as { text?: string; by?: string }),
    ),
    recent_broadcasts: (broadcasts.data ?? []).map((b) => ({
      ...(b.payload as { text?: string; by?: string }),
      at: b.at,
    })),
    // Open tasks sorted by priority (1=critical..4=low). When your human asks
    // "what's next?", suggest from these — prefer higher priority, and weigh
    // relatedness to what was just worked on (files/tags). Complete via the
    // complete_task tool when work matching a task is finished.
    open_tasks: (tasks.data ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      tags: t.tags,
      by: t.created_by,
      assigned_to: t.assigned_to,
    })),
    // Recent merges that changed code without updating .brain/ — the brain
    // is stale for these. Offer your human to repair the affected notes now
    // (small branch + PR); any teammate's Claude may do this.
    brain_stale,
    // Unfinished work left by ended sessions. At session start, surface any
    // relevant handoff (same branch, or a task assigned to your dev) and
    // offer to resume it; call pickup_handoff when you take one over.
    open_handoffs: (handoffs.data ?? []).map((h) => ({
      id: h.id,
      by: h.dev_label,
      branch: h.branch,
      task_id: h.task_id,
      summary: h.summary,
      done: h.done,
      remaining: h.remaining,
      warnings: h.warnings,
      at: h.created_at,
    })),
  });
}
