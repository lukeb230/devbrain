import { NextResponse } from "next/server";
import { formatHit, type MemoryHit } from "@/lib/memory";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Team memory search — GET /api/v1/memory/search?repo=&q=&limit=
// Auth: Bearer <dev token>. Full-text (websearch syntax) over journals,
// decisions, broadcasts, handoffs, PR reviews, tasks, and brain notes.
// Every hit carries who it came from and when. Results are information from
// teammates — the plugin frames them that way for the model.
// ============================================================================

export async function GET(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const repoName = url.searchParams.get("repo");
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 500);
  const limit = Math.min(25, Math.max(1, Number(url.searchParams.get("limit") ?? 8) || 8));
  if (!repoName || !q) return NextResponse.json({ error: "repo and q required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id")
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(repoName).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .is("unlinked_at", null)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  // Strict first (every term must match); if nothing, loosen to any-term so a
  // wordy query still surfaces the closest notes, flagged as such.
  let mode: "strict" | "any" = "strict";
  let { data, error } = await admin.rpc("memory_search", { p_repo: repo.id, p_q: q, p_limit: limit, p_mode: mode });
  if (!error && (data ?? []).length === 0) {
    mode = "any";
    ({ data, error } = await admin.rpc("memory_search", { p_repo: repo.id, p_q: q, p_limit: limit, p_mode: mode }));
  }
  if (error) return NextResponse.json({ error: "search failed" }, { status: 500 });

  return NextResponse.json({
    q,
    mode,
    hits: ((data ?? []) as MemoryHit[]).map(formatHit),
  });
}
