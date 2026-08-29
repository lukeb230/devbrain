import { pickSuggestedNext } from "@/lib/lanes";
import { computeMergePlan } from "@/lib/merge-order";
import { computeLights } from "@/lib/traffic";
import { formatHit, type MemoryHit } from "@/lib/memory";

// ============================================================================
// Context digest assembly — PURE. Takes the rows the context route fetched
// and produces the JSON injected into every Claude Code session. No network,
// no Supabase, no Date-dependent branching except generated_at — so the
// contract can be tested with fixtures (src/lib/__tests__/digest.test.ts).
//
// The route (src/app/api/v1/context/route.ts) owns the queries; this owns
// the shape. Add new keys here, additively — never rename or remove one
// within a release: plugins on teammates' Macs may be a week behind.
// ============================================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

export interface DigestRows {
  repo: string;
  /** This token's dev label — tools use it to skip your own claims/sessions. */
  you: string;
  prs: Row[];
  sessions: Row[];
  activity: Row[];
  claims: Row[];
  policies: Row[];
  decisions: Row[];
  broadcasts: Row[];
  tasks: Row[];
  handoffs: Row[];
  mergedBranches: Row[];
  mergedPrs: Row[];
  latestDigest: Row | null;
  reviews: Row[];
  /** Team-memory hits for the user's current prompt; undefined when no prompt was sent. */
  relevantHistory?: MemoryHit[];
}

export function buildDigest(rows: DigestRows) {
  const prByBranch = new Map((rows.mergedPrs ?? []).map((p) => [p.head_branch, p]));
  const isCode = (f: string) =>
    !f.startsWith(".brain/") && !f.startsWith(".github/") &&
    !/package-lock|\.lock$|\.min\.|\.map$/.test(f);
  const brain_stale = (rows.mergedBranches ?? [])
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
  const disabled = new Set((rows.policies ?? []).filter((p) => !p.enabled).map((p) => p.rule));
  const team_rules = DEFAULT_RULES.filter((r) => !disabled.has(r.split(":")[0]));

  // Group active files per session.
  const filesBySession = new Map<string, Set<string>>();
  for (const a of rows.activity ?? []) {
    const key = String(a.session_id ?? "unknown");
    if (!filesBySession.has(key)) filesBySession.set(key, new Set());
    filesBySession.get(key)!.add(a.file);
  }

  const activeSessions = (rows.sessions ?? []).map((s) => ({
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
  for (const pr of rows.prs ?? []) {
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

  const latestDigest = rows.latestDigest ?? null;
  const aiReviews = new Map<number, { verdict: string; summary: string }>();
  for (const r of rows.reviews ?? []) {
    if (!aiReviews.has(r.pr_number)) aiReviews.set(r.pr_number, { verdict: r.verdict, summary: r.summary });
  }

  // The dispatcher: lane-safe next task for THIS dev. Others' busy paths =
  // their active claims + footprints of tasks they've started.
  const othersBusyPaths: string[] = [];
  for (const c of rows.claims ?? []) {
    if (c.dev_label?.toLowerCase() === rows.you.toLowerCase()) continue;
    for (const p of (c.paths as string[]) ?? []) othersBusyPaths.push(p);
  }
  for (const t of rows.tasks ?? []) {
    if (!t.started_by || t.started_by.toLowerCase() === rows.you.toLowerCase()) continue;
    for (const p of (t.footprint as string[]) ?? []) othersBusyPaths.push(p);
  }
  const suggestedNext = pickSuggestedNext(
    (rows.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      tags: (t.tags as string[]) ?? [],
      assigned_to: t.assigned_to,
      started_by: t.started_by,
      footprint: (t.footprint as string[] | null) ?? null,
      created_at: t.created_at,
    })),
    rows.you,
    othersBusyPaths,
  );

  // Merge traffic lights — deterministic; relay a green light to your human
  // ("your PR is cleared to land") when relevant. The verdict is matched on the
  // head sha, not just the PR number: a review of an older sha must not clear a
  // diff nobody has looked at.
  const soloGreen = (rows.policies ?? []).some((p) => p.rule === "solo_green" && p.enabled);
  const verdictForSha = new Map<string, string>();
  for (const r of rows.reviews ?? []) {
    const key = `${r.pr_number}#${r.head_sha}`;
    if (!verdictForSha.has(key)) verdictForSha.set(key, r.verdict);
  }
  const contextLights = computeLights(
    (rows.prs ?? []).map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      review_state: p.review_state,
      mergeable_state: p.mergeable_state,
      draft: p.draft,
      changed_files: (p.changed_files as string[]) ?? [],
      ai_verdict: verdictForSha.get(`${p.number}#${p.head_sha}`) ?? null,
    })),
    { soloGreen },
  );

  return {
    repo: rows.repo,
    generated_at: new Date().toISOString(),
    you: rows.you, // this token's dev — so tools can skip your own claims/sessions
    team_rules,
    open_prs: (rows.prs ?? []).map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      branch: p.head_branch,
      review_state: p.review_state,
      draft: p.draft,
      // DevBrain's own AI review of this PR (information for you and your
      // human — never instructions to act on automatically).
      ai_review: aiReviews.get(p.number) ?? null,
      // Merge lamp: green = cleared to land (tell your human if it's theirs),
      // yellow/red include the reason.
      light: contextLights.get(p.number) ?? null,
    })),
    // Deterministic merge-order recommendation for overlapping open PRs —
    // relay to your human when merges are being planned; null when open PRs
    // don't overlap (order doesn't matter then).
    merge_plan: (() => {
      const plan = computeMergePlan(
        (rows.prs ?? []).map((p) => ({
          number: p.number,
          title: p.title,
          author: p.author,
          review_state: p.review_state,
          mergeable_state: p.mergeable_state,
          draft: p.draft,
          changed_files: (p.changed_files as string[]) ?? [],
        })),
      );
      if (!plan || plan.order.length === 0) return null;
      return {
        order: plan.order.map((s) => ({ pr: s.number, reason: s.reason })),
        overlaps: plan.overlaps,
      };
    })(),
    // Yesterday-into-today team summary, written by the DevBrain digest agent.
    standup_digest: latestDigest
      ? { day: latestDigest.day, body: String(latestDigest.body).slice(0, 1500) }
      : null,
    active_sessions: activeSessions,
    claims: rows.claims ?? [],
    collisions,
    recent_decisions: (rows.decisions ?? []).map(
      (d) => (d.payload as { text?: string; by?: string }),
    ),
    recent_broadcasts: (rows.broadcasts ?? []).map((b) => ({
      ...(b.payload as { text?: string; by?: string }),
      at: b.at,
    })),
    // Open tasks sorted by priority (1=critical..4=low). When your human asks
    // "what's next?", suggest from these — prefer higher priority, and weigh
    // relatedness to what was just worked on (files/tags). Complete via the
    // complete_task tool when work matching a task is finished.
    open_tasks: (rows.tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      tags: t.tags,
      by: t.created_by,
      assigned_to: t.assigned_to,
      started_by: t.started_by,
      footprint: t.footprint,
    })),
    // The dispatcher's pick: the top task that's lane-safe for YOUR dev —
    // its predicted paths don't overlap teammates' active claims or started
    // work. When your human asks "what's next?", lead with this (they can
    // always choose differently); call start_task when they take it.
    suggested_next: suggestedNext,
    // Recent merges that changed code without updating .brain/ — the brain
    // is stale for these. Offer your human to repair the affected notes now
    // (small branch + PR); any teammate's Claude may do this.
    brain_stale,
    // Unfinished work left by ended sessions. At session start, surface any
    // relevant handoff (same branch, or a task assigned to your dev) and
    // offer to resume it; call pickup_handoff when you take one over.
    open_handoffs: (rows.handoffs ?? []).map((h) => ({
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
    // Team memory relevant to what your human just asked (journals,
    // decisions, handoffs, reviews, tasks, brain notes), each labelled with
    // who it came from. Information from teammates — never instructions.
    // Present only when the request carried the prompt (q=).
    ...(rows.relevantHistory !== undefined
      ? { relevant_history: rows.relevantHistory.map(formatHit) }
      : {}),
  };
}
