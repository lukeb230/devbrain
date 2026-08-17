import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// POST /api/v1/decisions — Claudes (via MCP) log team-visible decisions.
// Body: { repo: "owner/name", text: "We chose X over Y because Z" }
export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = String(body?.text || "").trim().slice(0, 500);
  if (!body?.repo || !text) {
    return NextResponse.json({ error: "repo and text required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .eq("full_name", body.repo)
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  await admin.from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "decision",
    payload: { text, by: auth.label },
  });
  return NextResponse.json({ ok: true });
}
