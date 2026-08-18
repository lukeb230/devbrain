import { marked } from "marked";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { linkifyBody, parseBrain } from "@/lib/brain";
import { fetchBrainDocs } from "@/lib/github";
import { teamMembers } from "@/lib/members";
import { supabaseServer } from "@/lib/supabase/server";
import type { NotePayload } from "../dashboard/[repoId]/brain/explorer";
import { WidgetApp, type WidgetData } from "./app";

export const dynamic = "force-dynamic";

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
      supabase.from("linked_repos").select("id, full_name, default_branch, installation_id").order("created_at"),
      supabase.from("sessions").select("id, repo_id, dev_label, summary, last_seen").is("ended_at", null).gte("last_seen", activeSince).order("last_seen", { ascending: false }),
      supabase.from("prs").select("repo_id, number, title, author, review_state, draft, mergeable_state, html_url").eq("state", "open").order("updated_at", { ascending: false }).limit(10),
      supabase.from("branches").select("repo_id, name, changed_files").is("merged_at", null),
      supabase.from("tasks").select("id, repo_id, title, detail, priority, tags, assigned_to, status, done_by, done_at, created_by, created_at").order("priority").order("created_at"),
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
  const lastRepo = lastRepoId ? repoById.get(lastRepoId) : (repos ?? [])[0];
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
  };

  return <WidgetApp data={data} />;
}
