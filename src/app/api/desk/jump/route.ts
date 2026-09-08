import { NextResponse } from "next/server";
import { parseBrain } from "@/lib/brain";
import { cachedBrainDocs } from "@/lib/brain-cache";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";

// ============================================================================
// GET /api/desk/jump?repo=<id|all> — the index behind ⌘K jump-to-anything:
// open tasks, open PRs and (for one repo) the brain's note titles. RLS-scoped
// through the user's session; fetched lazily when the palette opens.
// ============================================================================

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "signed out" }, { status: 401 });
  const org = await currentOrg();
  if (!org) return NextResponse.json({ error: "no team" }, { status: 404 });

  const url = new URL(req.url);
  const repoParam = url.searchParams.get("repo") ?? "all";
  const part = url.searchParams.get("part") ?? "all";
  const { data: repos } = await supabase.from("linked_repos").select("id, full_name, default_branch, installation_id").eq("org_id", org.orgId).is("unlinked_at", null);
  const all = repos ?? [];
  const scoped = all.find((r) => r.id === repoParam) ?? null;
  const ids = scoped ? [scoped.id] : all.map((r) => r.id);
  const name = (id: string) => all.find((r) => r.id === id)?.full_name.split("/")[1] ?? "";

  const [{ data: tasks }, { data: prs }] = part === "notes" ? [{ data: [] }, { data: [] }] : await Promise.all([
    supabase.from("tasks").select("id, repo_id, title, priority, assigned_to, started_by").in("repo_id", ids).eq("status", "open").order("priority").limit(200),
    supabase.from("prs").select("repo_id, number, title, author").in("repo_id", ids).eq("state", "open").order("number", { ascending: false }).limit(100),
  ]);
  if (part === "core") return NextResponse.json({
    tasks: (tasks ?? []).map((t) => ({ id: t.id, repo_id: t.repo_id, repo: name(t.repo_id), title: t.title, priority: t.priority, who: t.started_by ?? t.assigned_to ?? null })),
    prs: (prs ?? []).map((p) => ({ repo_id: p.repo_id, repo: name(p.repo_id), number: p.number, title: p.title, author: p.author })),
  });

  let notes: { slug: string; title: string; type: string }[] = [];
  if (scoped) {
    try {
      const graph = parseBrain(await cachedBrainDocs(scoped.installation_id, scoped.full_name, scoped.default_branch));
      notes = graph.notes.map((n) => ({ slug: n.slug, title: n.title, type: n.type }));
    } catch {
      /* no brain, or GitHub unreachable — the palette just has no notes */
    }
  }

  if (part === "notes") return NextResponse.json({ notes, noteRepo: scoped?.id ?? null });
  return NextResponse.json({
    tasks: (tasks ?? []).map((t) => ({ id: t.id, repo_id: t.repo_id, repo: name(t.repo_id), title: t.title, priority: t.priority, who: t.started_by ?? t.assigned_to ?? null })),
    prs: (prs ?? []).map((p) => ({ repo_id: p.repo_id, repo: name(p.repo_id), number: p.number, title: p.title, author: p.author })),
    notes,
    noteRepo: scoped?.id ?? null,
  });
}
