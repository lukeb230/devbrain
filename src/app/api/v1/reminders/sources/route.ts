import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Reminders sources for collectors — GET /api/v1/reminders/sources
// Auth: Bearer <dev token>. Returns the org's list → repo mappings so a Mac
// knows which Reminders lists to read. Manage them on Settings → Reminders
// (or `devbrain reminders add|remove`, which POST/DELETE here).
// ============================================================================

async function org(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  return auth;
}

export async function GET(request: Request) {
  const auth = await org(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("reminder_sources")
    .select("id, list_name, created_by, created_at, linked_repos(full_name)")
    .eq("org_id", auth.org_id)
    .order("list_name");
  return NextResponse.json({
    sources: (data ?? []).map((s) => ({
      id: s.id,
      list: s.list_name,
      repo: (s.linked_repos as unknown as { full_name: string } | null)?.full_name ?? null,
      by: s.created_by,
      at: s.created_at,
    })),
  });
}

/** Body: { list, repo } — map a list to a repo (replaces an existing mapping for that list). */
export async function POST(request: Request) {
  const auth = await org(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const list = String(body?.list ?? "").trim().slice(0, 120);
  const repoName = String(body?.repo ?? "").trim();
  if (!list || !repoName) return NextResponse.json({ error: "list and repo required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id")
    .ilike("full_name", repoName.replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });
  // Replace any existing mapping for this list (case-insensitive).
  await admin.from("reminder_sources").delete().eq("org_id", auth.org_id).ilike("list_name", list.replace(/[%_\\]/g, "\\$&"));
  const { error } = await admin.from("reminder_sources").insert({ org_id: auth.org_id, repo_id: repo.id, list_name: list, created_by: auth.label });
  if (error) return NextResponse.json({ error: "could not save mapping" }, { status: 500 });
  return NextResponse.json({ ok: true, list, repo: repoName });
}

/** Body: { list } — remove a mapping. */
export async function DELETE(request: Request) {
  const auth = await org(request);
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const list = String(body?.list ?? "").trim();
  if (!list) return NextResponse.json({ error: "list required" }, { status: 400 });
  const admin = supabaseAdmin();
  const { count } = await admin
    .from("reminder_sources")
    .delete({ count: "exact" })
    .eq("org_id", auth.org_id)
    .ilike("list_name", list.replace(/[%_\\]/g, "\\$&"));
  return NextResponse.json({ ok: true, removed: count ?? 0 });
}
