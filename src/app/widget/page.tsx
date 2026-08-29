import { marked } from "marked";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { cachedBrainDocs } from "@/lib/brain-cache";
import { teamMembers } from "@/lib/members";
import { computeMergePlan } from "@/lib/merge-order";
import { RULES_CATALOG, WRITER_CATALOG } from "@/lib/rules-catalog";
import { computeLights } from "@/lib/traffic";
import { COOKIE } from "@/lib/cookies";
import { currentOrg, hasRole } from "@/lib/org";
import { openAlerts } from "@/lib/alerts";
import { supabaseServer } from "@/lib/supabase/server";
import type { NotePayload } from "../dashboard/[repoId]/brain/explorer";
import { WidgetApp, type WidgetData } from "./app";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // braindump splitter calls Claude from a server action

// /widget — the desktop panel's mini-app. Team-wide glance data plus the
// last-visited repo's brain, handed to a client tab UI (no scrolling on Home).

function esc(s: string) {
  return s.replace(/</g, "&lt;");
}

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: notice } = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=widget");
  const org = await currentOrg();
  if (!org) redirect("/welcome?from=widget");

  const lastRepoId = (await cookies()).get(COOKIE.lastRepo)?.value ?? null;
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const daySince = new Date(Date.now() - 24 * 3600_000).toISOString();

  const members = await teamMembers(org.orgId);
  const [{ data: repos }, { data: sessions }, { data: prs }, { data: branches }, { data: tasks }, { data: feed }, { data: activity }, { data: handoffs }, { data: journals }] =
    await Promise.all([
      supabase.from("linked_repos").select("id, full_name, default_branch, installation_id, writer_installation_id").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, head_sha, review_state, draft, mergeable_state, changed_files, html_url").eq("state", "open").order("updated_at", { ascending: false }).limit(10),
      supabase.from("branches").select("repo_id, name, changed_files, last_push_at").is("merged_at", null),
      supabase.from("tasks").select("id, repo_id, title, detail, priority, tags, assigned_to, status, done_by, done_at, created_by, created_at, maybe_done_pr, started_by, footprint, pinned").order("priority").order("created_at"),
      supabase.from("events").select("kind, payload, at, repo_id").in("kind", ["decision", "broadcast"]).order("at", { ascending: false }).limit(8),
      supabase.from("activity").select("session_id, dev_label, label, branch, file, tool, at, repo_id").gte("at", daySince).order("at", { ascending: false }).limit(150),
      supabase.from("handoffs").select("id, repo_id, dev_label, branch, summary, remaining, created_at").is("picked_up_at", null).order("created_at", { ascending: false }).limit(4),
      supabase.from("journals").select("id, repo_id, dev_label, branch, summary, learned, tried_and_failed, remaining, at").order("at", { ascending: false }).limit(6),
    ]);

  const repoById = new Map((repos ?? []).map((r) => [r.id, r]));
  const short = (id: string) => repoById.get(id)?.full_name.split("/")[1] ?? "?";

  // The selector is a real filter: "all" (or unset) = team-wide; a repo id
  // scopes EVERY list below to that repo. Applied post-fetch — volumes are
  // tiny and it keeps the queries simple.
  const scopeAll = !lastRepoId || lastRepoId === "all" || !repoById.has(lastRepoId);
  const inScope = (repoId: string) => scopeAll || repoId === lastRepoId;

  // Collisions: only branches pushed in the last 7 days participate — a
  // stale branch row must never generate warnings forever.
  const branchCutoff = Date.now() - 7 * 24 * 3600_000;

  const collisions: WidgetData["collisions"] = [];
  const byRepo = new Map<string, Map<string, string[]>>();
  for (const b of branches ?? []) {
    if (!inScope(b.repo_id)) continue;
    if (b.last_push_at && new Date(b.last_push_at).getTime() < branchCutoff) continue;
    if (!byRepo.has(b.repo_id)) byRepo.set(b.repo_id, new Map());
    const m = byRepo.get(b.repo_id)!;
    for (const f of (b.changed_files as string[]) ?? []) {
      if (!m.has(f)) m.set(f, []);
      m.get(f)!.push(b.name);
    }
  }
  for (const [repoId, m] of byRepo) {
    for (const [file, bs] of m) {
      if (bs.length > 1) collisions.push({ repo: short(repoId), file, branches: bs });
    }
  }

  // Brain for the last-visited repo (best effort; tab degrades gracefully).
  let brain: WidgetData["brain"] = null;
  const lastRepo = lastRepoId ? (repoById.get(lastRepoId) ?? (repos ?? [])[0]) : (repos ?? [])[0];
  if (lastRepo) {
    try {
      const files = await cachedBrainDocs(lastRepo.installation_id, lastRepo.full_name, lastRepo.default_branch);
      const graph = parseBrain(files);
      if (graph.notes.length > 0) {
        const byTitle = new Map(graph.notes.map((n) => [n.title.toLowerCase(), n.slug]));
        const hrefFor = (slug: string) => `?note=${slug}`;
        const notes: NotePayload[] = graph.notes.map((n) => ({
          slug: n.slug,
          title: n.title,
          type: n.type,
          touches: n.touches,
          html: marked.parse(esc(linkifyBody(n.body, byTitle, hrefFor))) as string,
          backlinks: (graph.backlinks.get(n.slug) ?? []).map((b) => ({
            slug: b,
            title: graph.bySlug.get(b)?.title ?? b,
          })),
        }));
        const nodes = graph.notes.map((n) => ({
          slug: n.slug,
          title: n.title,
          type: n.type,
          degree: n.links.length + (graph.backlinks.get(n.slug)?.length ?? 0),
        }));
        const edges: { a: string; b: string }[] = [];
        const seen = new Set<string>();
        for (const n of graph.notes) {
          for (const l of n.links) {
            const key = [n.slug, l].sort().join("→");
            if (!seen.has(key)) {
              seen.add(key);
              edges.push({ a: n.slug, b: l });
            }
          }
        }
        brain = { notes, nodes, edges, repoId: lastRepo.id, repoName: lastRepo.full_name };
      }
    } catch {
      /* brain tab degrades */
    }
  }

  // Team rules for the last-visited repo — editable from the Settings view.
  let rules: WidgetData["rules"] = [];
  if (lastRepo) {
    const { data: policyRows } = await supabase
      .from("policies")
      .select("rule, enabled")
      .eq("repo_id", lastRepo.id);
    const state = new Map((policyRows ?? []).map((r) => [r.rule, r.enabled]));
    rules = RULES_CATALOG.map((c) => ({
      rule: c.rule,
      label: c.label,
      on: state.get(c.rule) ?? true, // core rules default ON
    }));
    if (lastRepo.writer_installation_id) {
      for (const c of WRITER_CATALOG) {
        rules.push({ rule: c.rule, label: c.label, on: state.get(c.rule) ?? false }); // writer rules default OFF
      }
    }
  }

  // Who am I — used to skip notifying yourself about your own actions.
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const self = String(meta.user_name || meta.preferred_username || user.email?.split("@")[0] || "") || null;

  // Apply the repo scope to every list the widget renders.
  const fSessions = (sessions ?? []).filter((s) => inScope(s.repo_id));
  const fPrs = (prs ?? []).filter((p) => inScope(p.repo_id));
  const fTasks = (tasks ?? []).filter((t) => inScope(t.repo_id));
  const fHandoffs = (handoffs ?? []).filter((h) => inScope(h.repo_id));
  const fActivity = (activity ?? []).filter((a) => inScope(a.repo_id));
  const fFeed = (feed ?? []).filter((d) => inScope(d.repo_id));

  // Active claims (lanes) across the org — the glance data.
  const { data: claimRows } = await supabase
    .from("claims")
    .select("id, repo_id, dev_label, paths, note, expires_at, task_id")
    .is("released_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("created_at", { ascending: false })
    .limit(8);

  // Agent tier: AI review per open PR (matched by head sha) + latest digest.
  const [{ data: reviewRows }, { data: digestRows }] = await Promise.all([
    supabase
      .from("pr_reviews")
      .select("repo_id, pr_number, head_sha, verdict, summary")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("digests").select("day, body, repo_id").order("day", { ascending: false }).limit(12),
  ]);
  const reviewFor = new Map<string, { verdict: string; summary: string }>();
  for (const r of reviewRows ?? []) {
    const key = `${r.repo_id}#${r.pr_number}#${r.head_sha}`;
    if (!reviewFor.has(key)) reviewFor.set(key, { verdict: r.verdict, summary: r.summary });
  }

  // Traffic lights per repo (deterministic, same lib as the dashboard).
  const lightsByRepo = new Map<string, ReturnType<typeof computeLights>>();
  {
    const grouped = new Map<string, NonNullable<typeof prs>>();
    for (const p of fPrs) {
      if (!grouped.has(p.repo_id)) grouped.set(p.repo_id, []);
      grouped.get(p.repo_id)!.push(p);
    }
    for (const [rid, rows] of grouped) {
      lightsByRepo.set(
        rid,
        computeLights(
          rows.map((p) => ({
            number: p.number,
            title: p.title,
            author: p.author,
            review_state: p.review_state,
            mergeable_state: p.mergeable_state,
            draft: p.draft,
            changed_files: (p.changed_files as string[]) ?? [],
          })),
        ),
      );
    }
  }

  const data: WidgetData = {
    // Deployment stamp. The panel is a long-lived webview: data refreshes
    // via router.refresh(), but the JS bundle does not. The client compares
    // this against the value it booted with and hard-reloads on change.
    deploy: process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ?? "dev",
    sessions: fSessions.map((s) => ({
      id: String(s.id),
      repo: short(s.repo_id),
      dev_label: s.dev_label,
      summary: s.summary,
      last_seen: s.last_seen,
    })),
    collisions,
    prs: fPrs.map((p) => ({
      repo_id: p.repo_id,
      repo: short(p.repo_id),
      defaultBranch: repoById.get(p.repo_id)?.default_branch ?? "main",
      number: p.number,
      title: p.title,
      author: p.author,
      review_state: p.review_state,
      draft: p.draft,
      mergeable_state: p.mergeable_state,
      html_url: p.html_url,
      ai: (p.head_sha && reviewFor.get(`${p.repo_id}#${p.number}#${p.head_sha}`)) || null,
      light: lightsByRepo.get(p.repo_id)?.get(p.number) ?? null,
    })),
    tasks: fTasks.map((t) => ({
      id: t.id,
      pinned: Boolean(t.pinned),
      repo_id: t.repo_id,
      repo: short(t.repo_id),
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      tags: (t.tags as string[]) ?? [],
      assigned_to: t.assigned_to,
      status: t.status,
      done_by: t.done_by,
      created_by: t.created_by,
      created_at: t.created_at,
      maybe_done_pr: t.maybe_done_pr,
      started_by: t.started_by,
      footprint: (t.footprint as string[] | null) ?? null,
    })),
    claims: (claimRows ?? []).filter((c) => inScope(c.repo_id)).map((c) => ({
      id: c.id,
      repo_id: c.repo_id,
      repo: short(c.repo_id),
      dev_label: c.dev_label,
      paths: (c.paths as string[]) ?? [],
      note: c.note,
      expires_at: c.expires_at,
    })),
    journals: (journals ?? []).filter((j) => inScope(j.repo_id)).map((j) => ({
      id: j.id,
      repo: short(j.repo_id),
      by: j.dev_label,
      branch: j.branch,
      summary: j.summary,
      learned: (j.learned as string[]) ?? [],
      tried_and_failed: (j.tried_and_failed as string[]) ?? [],
      remaining: j.remaining,
      at: j.at,
    })),
    feed: fFeed.map((d) => {
      const p = d.payload as { text?: string; by?: string };
      return { kind: d.kind, text: p.text ?? "", by: p.by ?? null, at: d.at };
    }),
    activity: fActivity.map((a) => ({
      session_id: a.session_id ? String(a.session_id) : null,
      dev_label: a.dev_label,
      label: a.label,
      branch: a.branch,
      file: a.file,
      tool: a.tool,
      at: a.at,
      repo: repoById.get(a.repo_id)?.full_name ?? null,
    })),
    handoffs: fHandoffs.map((h) => ({
      id: h.id,
      repo_id: h.repo_id,
      repo: short(h.repo_id),
      by: h.dev_label,
      branch: h.branch,
      summary: h.summary,
      remaining: h.remaining,
      at: h.created_at,
    })),
    members,
    brain,
    lastRepo: lastRepo ? { id: lastRepo.id, name: short(lastRepo.id) } : null,
    conflicted: fPrs.filter((p) => p.mergeable_state === "dirty").length,
    rules,
    self,
    repos: (repos ?? []).map((r) => ({ id: r.id, name: short(r.id), full_name: r.full_name })),
    alerts: hasRole(org.role, "admin") ? (await openAlerts(org.orgId)).map((a) => ({ id: a.id, severity: a.severity, title: a.title, count: a.count })) : [],
    canAdmin: hasRole(org.role, "admin"),
    teamId: org.orgId,
    teamName: org.orgName,
    teams: org.orgs.map((o) => ({ id: o.id, name: o.name })),
    notice: notice ?? null,
    scopeAll,
    digest: (() => {
      // Digests are per-repo. Scoped → that repo's; All repos → the newest,
      // labelled so it's never mistaken for team-wide.
      const rows = (digestRows ?? []).filter((d) => inScope(d.repo_id));
      const row = rows[0];
      return row ? { day: row.day, body: row.body, repo: short(row.repo_id) } : null;
    })(),
    mergePlan: (() => {
      // Full merge-order plan for the active repo's overlapping PRs.
      if (!lastRepo) return null;
      const plan = computeMergePlan(
        (prs ?? [])
          .filter((p) => p.repo_id === lastRepo.id)
          .map((p) => ({
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
        repo: short(lastRepo.id),
        order: plan.order.map((s) => ({ number: s.number, title: s.title, reason: s.reason })),
      };
    })(),
  };

  return <WidgetApp data={data} />;
}
