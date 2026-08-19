import { marked } from "marked";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { fetchBrainDocs } from "@/lib/github";
import { teamMembers } from "@/lib/members";
import { computeMergePlan } from "@/lib/merge-order";
import { RULES_CATALOG, WRITER_CATALOG } from "@/lib/rules-catalog";
import { computeLights } from "@/lib/traffic";
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

export default async function WidgetPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=widget");

  const lastRepoId = (await cookies()).get("devbrain_last_repo")?.value ?? null;
  const activeSince = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const daySince = new Date(Date.now() - 24 * 3600_000).toISOString();

  const members = await teamMembers();
  const [{ data: repos }, { data: sessions }, { data: prs }, { data: branches }, { data: tasks }, { data: feed }, { data: activity }, { data: handoffs }] =
    await Promise.all([
      supabase.from("linked_repos").select("id, full_name, default_branch, installation_id, writer_installation_id").order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, head_sha, review_state, draft, mergeable_state, changed_files, html_url").eq("state", "open").order("updated_at", { ascending: false }).limit(10),
      supabase.from("branches").select("repo_id, name, changed_files").is("merged_at", null),
      supabase.from("tasks").select("id, repo_id, title, detail, priority, tags, assigned_to, status, done_by, done_at, created_by, created_at, maybe_done_pr").order("priority").order("created_at"),
      supabase.from("events").select("kind, payload, at").in("kind", ["decision", "broadcast"]).order("at", { ascending: false }).limit(8),
      supabase.from("activity").select("session_id, dev_label, label, branch, file, tool, at, repo_id").gte("at", daySince).order("at", { ascending: false }).limit(150),
      supabase.from("handoffs").select("id, repo_id, dev_label, branch, summary, remaining, created_at").is("picked_up_at", null).order("created_at", { ascending: false }).limit(4),
    ]);

  const repoById = new Map((repos ?? []).map((r) => [r.id, r]));
  const short = (id: string) => repoById.get(id)?.full_name.split("/")[1] ?? "?";

  const collisions: WidgetData["collisions"] = [];
  const byRepo = new Map<string, Map<string, string[]>>();
  for (const b of branches ?? []) {
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
      const files = await fetchBrainDocs(lastRepo.installation_id, lastRepo.full_name, lastRepo.default_branch);
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

  // Agent tier: AI review per open PR (matched by head sha) + latest digest.
  const [{ data: reviewRows }, { data: digestRows }] = await Promise.all([
    supabase
      .from("pr_reviews")
      .select("repo_id, pr_number, head_sha, verdict, summary")
      .order("created_at", { ascending: false })
      .limit(60),
    supabase.from("digests").select("day, body").order("day", { ascending: false }).limit(1),
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
    for (const p of prs ?? []) {
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
    sessions: (sessions ?? []).map((s) => ({
      id: String(s.id),
      repo: short(s.repo_id),
      dev_label: s.dev_label,
      summary: s.summary,
      last_seen: s.last_seen,
    })),
    collisions,
    prs: (prs ?? []).map((p) => ({
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
    tasks: (tasks ?? []).map((t) => ({
      id: t.id,
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
    })),
    feed: (feed ?? []).map((d) => {
      const p = d.payload as { text?: string; by?: string };
      return { kind: d.kind, text: p.text ?? "", by: p.by ?? null, at: d.at };
    }),
    activity: (activity ?? []).map((a) => ({
      session_id: a.session_id ? String(a.session_id) : null,
      dev_label: a.dev_label,
      label: a.label,
      branch: a.branch,
      file: a.file,
      tool: a.tool,
      at: a.at,
      repo: repoById.get(a.repo_id)?.full_name ?? null,
    })),
    handoffs: (handoffs ?? []).map((h) => ({
      id: h.id,
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
    conflicted: (prs ?? []).filter((p) => p.mergeable_state === "dirty").length,
    rules,
    self,
    digest: (digestRows ?? [])[0] ?? null,
    mergeHint: (() => {
      // One-line merge-order hint for the last-visited repo's overlapping PRs.
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
      return "Suggested merge order: " + plan.order.map((s) => `#${s.number}`).join(" then ") + " — these PRs share files.";
    })(),
  };

  return <WidgetApp data={data} />;
}
