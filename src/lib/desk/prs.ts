import type { SupabaseClient } from "@supabase/supabase-js";
import { teamRepos } from "./repos";
import { computeMergePlan, type MergePlan } from "@/lib/merge-order";
import { computeLights, type Light } from "@/lib/traffic";

// ============================================================================
// Pull requests for the Desk — one loader for the list and the detail page.
// Lights and merge order come from the same libs the tick and the panel use;
// the rebase radar is the digest's rule (an open PR shares files with a PR
// merged since the open one was last pushed). Read-only: DevBrain never
// writes to a PR from a page — the tick does, behind the Rules switches.
// ============================================================================

export interface DeskPr {
  repo_id: string;
  repo: string; // short name
  full_name: string;
  default_branch: string;
  number: number;
  title: string;
  author: string | null;
  head_sha: string | null;
  head_branch: string | null;
  base_branch: string | null;
  review_state: string | null;
  draft: boolean;
  mergeable_state: string | null;
  changed_files: string[];
  html_url: string | null;
  updated_at: string | null;
  light: Light | null;
  review: { verdict: string; summary: string; points: { kind: string; text: string }[]; created_at: string } | null;
  /** Merged since this PR's last push and sharing files with it. */
  rebase: { after: number[]; files: string[] } | null;
}

export interface RepoPrs {
  repo_id: string;
  repo: string;
  full_name: string;
  default_branch: string;
  prs: DeskPr[];
  plan: MergePlan | null;
}

export async function loadPrs(supabase: SupabaseClient, orgId: string, repoId: string | null): Promise<RepoPrs[]> {
  const since = new Date(Date.now() - 72 * 3600_000).toISOString();
  const all = await teamRepos(orgId);
  const repos = repoId ? all.filter((r) => r.id === repoId) : all;
  const ids = repos.map((r) => r.id);
  if (ids.length === 0) return [];

  const [{ data: prs }, { data: merged }, { data: reviews }, { data: solo }] = await Promise.all([
    supabase.from("prs").select("repo_id, number, title, author, head_sha, head_branch, base_branch, review_state, draft, mergeable_state, changed_files, html_url, updated_at").in("repo_id", ids).eq("state", "open").order("updated_at", { ascending: false }),
    supabase.from("prs").select("repo_id, number, changed_files, updated_at").in("repo_id", ids).eq("state", "merged").gte("updated_at", since),
    supabase.from("pr_reviews").select("repo_id, pr_number, head_sha, verdict, summary, points, created_at").in("repo_id", ids).order("created_at", { ascending: false }).limit(200),
    supabase.from("policies").select("repo_id, enabled").in("repo_id", ids).eq("rule", "solo_green"),
  ]);
  const soloGreen = new Set((solo ?? []).filter((p) => p.enabled).map((p) => p.repo_id));
  const reviewFor = new Map<string, DeskPr["review"]>();
  for (const r of reviews ?? []) {
    const k = `${r.repo_id}#${r.pr_number}#${r.head_sha}`;
    if (!reviewFor.has(k)) reviewFor.set(k, { verdict: r.verdict, summary: r.summary, points: ((r.points as { kind: string; text: string }[]) ?? []), created_at: r.created_at });
  }

  return (repos ?? []).map((repo) => {
    const rows = (prs ?? []).filter((p) => p.repo_id === repo.id);
    const mergedHere = (merged ?? []).filter((m) => m.repo_id === repo.id);
    const mergePrs = rows.map((p) => ({
      number: p.number,
      title: p.title,
      author: p.author,
      review_state: p.review_state,
      mergeable_state: p.mergeable_state,
      draft: p.draft,
      changed_files: (p.changed_files as string[]) ?? [],
      ai_verdict: reviewFor.get(`${p.repo_id}#${p.number}#${p.head_sha}`)?.verdict ?? null,
    }));
    const lights = computeLights(mergePrs, { soloGreen: soloGreen.has(repo.id) });
    const plan = computeMergePlan(mergePrs);
    const short = repo.full_name.split("/")[1] ?? repo.full_name;
    return {
      repo_id: repo.id,
      repo: short,
      full_name: repo.full_name,
      default_branch: repo.default_branch ?? "main",
      plan,
      prs: rows.map((p) => {
        const files = new Set((p.changed_files as string[]) ?? []);
        const hits = mergedHere
          .filter((m) => m.updated_at && p.updated_at && m.updated_at > p.updated_at)
          .map((m) => ({ n: m.number, files: (((m.changed_files as string[]) ?? []).filter((f) => files.has(f))) }))
          .filter((h) => h.files.length > 0);
        return {
          repo_id: p.repo_id,
          repo: short,
          full_name: repo.full_name,
          default_branch: repo.default_branch ?? "main",
          number: p.number,
          title: p.title,
          author: p.author,
          head_sha: p.head_sha,
          head_branch: p.head_branch,
          base_branch: p.base_branch,
          review_state: p.review_state,
          draft: p.draft,
          mergeable_state: p.mergeable_state,
          changed_files: (p.changed_files as string[]) ?? [],
          html_url: p.html_url,
          updated_at: p.updated_at,
          light: lights.get(p.number) ?? null,
          review: reviewFor.get(`${p.repo_id}#${p.number}#${p.head_sha}`) ?? null,
          rebase: hits.length ? { after: hits.map((h) => h.n), files: [...new Set(hits.flatMap((h) => h.files))].slice(0, 8) } : null,
        };
      }),
    };
  });
}

export const VERDICT: Record<string, { label: string; tone: "go" | "wait" | "stop" | "dim" }> = {
  looks_good: { label: "looks good", tone: "go" },
  caution: { label: "caution", tone: "wait" },
  risky: { label: "risky", tone: "stop" },
  skipped: { label: "too large — review by hand", tone: "dim" },
};
