import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// POST /api/v1/broadcasts — a Claude (or dev) sends a live heads-up to every
// teammate and their Claudes. Lands on the dashboard feed and in every active
// session's next delta injection.
// Body: { repo: "owner/name", text: "About to change the Store API signature" }
export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const text = String(body?.text || "").trim().slice(0, 300);
  if (!body?.repo || !text) {
    return NextResponse.json({ error: "repo and text required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(body.repo).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  await admin.from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "broadcast",
    payload: { text, by: auth.label },
  });
  return NextResponse.json({ ok: true });
}
