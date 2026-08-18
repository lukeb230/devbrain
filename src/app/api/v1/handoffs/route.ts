import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Session handoffs (Bearer <dev token>).
//   POST { repo, action: "leave", summary, done?, remaining?, warnings?,
//          branch?, task_id? }                — leave a handoff note
//   POST { repo, action: "pickup", id }       — claim a handoff (marks who)
// Open handoffs are served to every Claude via the context digest.
// ============================================================================

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.repo) return NextResponse.json({ error: "repo required" }, { status: 400 });

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .eq("full_name", String(body.repo))
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const action = String(body.action || "leave");

  if (action === "leave") {
    const summary = String(body.summary || "").trim().slice(0, 300);
    if (!summary) return NextResponse.json({ error: "summary required" }, { status: 400 });
    const clean = (v: unknown) => {
      const s = String(v || "").trim().slice(0, 1500);
      return s || null;
    };
    const { data } = await admin
      .from("handoffs")
      .insert({
        org_id: repo.org_id,
        repo_id: repo.id,
        dev_label: auth.label,
        branch: String(body.branch || "").trim() || null,
        task_id: String(body.task_id || "").trim() || null,
        summary,
        done: clean(body.done),
        remaining: clean(body.remaining),
        warnings: clean(body.warnings),
      })
      .select("id")
      .single();
    return NextResponse.json({ ok: true, id: data?.id });
  }

  if (action === "pickup") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data } = await admin
      .from("handoffs")
      .update({ picked_up_by: auth.label, picked_up_at: new Date().toISOString() })
      .eq("id", id)
      .eq("repo_id", repo.id)
      .is("picked_up_at", null)
      .select("id, summary, done, remaining, warnings, branch, dev_label")
      .single();
    if (!data) return NextResponse.json({ error: "handoff not found or already picked up" }, { status: 404 });
    return NextResponse.json({ ok: true, handoff: data });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
