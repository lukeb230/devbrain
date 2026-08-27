import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Claims — soft, time-boxed intent locks (Bearer <dev token>).
//   POST { repo, action: "claim", paths: string[], note?, hours? }
//   POST { repo, action: "release", id? }   — no id releases ALL your claims
// A claim says "I own this area until <expiry> — route around it." It blocks
// nothing physically; Claudes respect it via context + the pre-edit guard.
// ============================================================================

const MAX_HOURS = 72;

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.repo) return NextResponse.json({ error: "repo required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(String(body.repo).replace(/[%_\\]/g, "\\$&")))
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const action = String(body.action || "claim");

  if (action === "claim") {
    const paths = Array.isArray(body.paths)
      ? [...new Set(body.paths.map((p: unknown) => String(p).trim()).filter(Boolean))].slice(0, 20)
      : [];
    if (paths.length === 0) return NextResponse.json({ error: "paths required" }, { status: 400 });
    const hours = Math.min(MAX_HOURS, Math.max(1, Number(body.hours) || 24));
    const { data } = await admin
      .from("claims")
      .insert({
        org_id: repo.org_id,
        repo_id: repo.id,
        user_id: auth.user_id,
        dev_label: auth.label,
        paths,
        note: String(body.note || "").trim().slice(0, 300) || null,
        expires_at: new Date(Date.now() + hours * 3600_000).toISOString(),
      })
      .select("id, expires_at")
      .single();
    return NextResponse.json({ ok: true, id: data?.id, expires_at: data?.expires_at });
  }

  if (action === "release") {
    const id = String(body.id || "");
    let q = admin
      .from("claims")
      .update({ released_at: new Date().toISOString() })
      .eq("repo_id", repo.id)
      .is("released_at", null);
    // With an id: release that claim (anyone on the team may — it's a soft
    // lock, and stale locks are worse than generous unlocks). Without an id:
    // release all of YOUR claims.
    q = id ? q.eq("id", id) : q.eq("user_id", auth.user_id);
    const { data } = await q.select("id");
    return NextResponse.json({ ok: true, released: (data ?? []).length });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
