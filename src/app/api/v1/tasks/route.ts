import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";

// ============================================================================
// Task board API for agents (Bearer <dev token>).
//   GET  /api/v1/tasks?repo=owner/name          — open tasks by priority (+ recent done)
//   POST /api/v1/tasks { repo, action: "create", title, priority?, tags?, detail? }
//   POST /api/v1/tasks { repo, action: "complete" | "reopen", id }
// ============================================================================

async function repoFor(auth: { org_id: string }, repoFull: string) {
  const admin = supabaseAdmin();
  const { data } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .eq("full_name", repoFull)
    .eq("org_id", auth.org_id)
    .single();
  return data;
}

export async function GET(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const repoFull = url.searchParams.get("repo") ?? "";
  const repo = await repoFor(auth, repoFull);
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const admin = supabaseAdmin();
  const { data: tasks } = await admin
    .from("tasks")
    .select("id, title, detail, priority, tags, status, created_by, created_at, done_by, done_at, assigned_to")
    .eq("repo_id", repo.id)
    .order("priority")
    .order("created_at");
  const open = (tasks ?? []).filter((t) => t.status === "open");
  const done = (tasks ?? []).filter((t) => t.status === "done").slice(-10);
  return NextResponse.json({ open, recently_done: done });
}

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!body?.repo) return NextResponse.json({ error: "repo required" }, { status: 400 });
  const repo = await repoFor(auth, String(body.repo));
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const admin = supabaseAdmin();
  const action = String(body.action || "create");

  if (action === "create") {
    const title = String(body.title || "").trim().slice(0, 200);
    if (!title) return NextResponse.json({ error: "title required" }, { status: 400 });
    const priority = Math.min(4, Math.max(1, Number(body.priority) || 3));
    const tags = Array.isArray(body.tags)
      ? [...new Set(body.tags.map((t: unknown) => String(t).toLowerCase().trim()).filter(Boolean))].slice(0, 8)
      : [];
    const { data } = await admin
      .from("tasks")
      .insert({
        org_id: repo.org_id,
        repo_id: repo.id,
        title,
        detail: String(body.detail || "").trim().slice(0, 1000) || null,
        priority,
        tags,
        created_by: auth.label,
        assigned_to: String(body.assigned_to || "").trim() || null,
      })
      .select("id")
      .single();
    return NextResponse.json({ ok: true, id: data?.id });
  }

  if (action === "assign") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data } = await admin
      .from("tasks")
      .update({ assigned_to: String(body.assigned_to || "").trim() || null })
      .eq("id", id)
      .eq("repo_id", repo.id)
      .select("id, title, assigned_to")
      .single();
    if (!data) return NextResponse.json({ error: "task not found" }, { status: 404 });
    return NextResponse.json({ ok: true, task: data });
  }

  if (action === "complete" || action === "reopen") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const patch =
      action === "complete"
        ? { status: "done", done_at: new Date().toISOString(), done_by: auth.label }
        : { status: "open", done_at: null, done_by: null };
    const { data } = await admin
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .eq("repo_id", repo.id)
      .select("id, title, status")
      .single();
    if (!data) return NextResponse.json({ error: "task not found" }, { status: 404 });
    if (action === "complete") {
      // Completing a task releases its lane claims automatically.
      await admin
        .from("claims")
        .update({ released_at: new Date().toISOString() })
        .eq("task_id", id)
        .is("released_at", null);
    }
    return NextResponse.json({ ok: true, task: data });
  }

  // Start a task: take it, and claim its predicted lane so the rest of the
  // team (and every teammate's Claude) routes around you automatically.
  if (action === "start") {
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data: task } = await admin
      .from("tasks")
      .select("id, title, footprint, started_by, status")
      .eq("id", id)
      .eq("repo_id", repo.id)
      .single();
    if (!task) return NextResponse.json({ error: "task not found" }, { status: 404 });
    if (task.status !== "open") return NextResponse.json({ error: "task is not open" }, { status: 400 });
    if (task.started_by && task.started_by.toLowerCase() !== auth.label.toLowerCase()) {
      return NextResponse.json({ error: `already started by ${task.started_by}` }, { status: 409 });
    }
    await admin
      .from("tasks")
      .update({ started_by: auth.label, started_at: new Date().toISOString(), assigned_to: auth.label })
      .eq("id", id);
    const footprint = Array.isArray(task.footprint) ? (task.footprint as string[]) : [];
    let claim_id: string | null = null;
    if (footprint.length > 0) {
      const { data: claim } = await admin
        .from("claims")
        .insert({
          org_id: repo.org_id,
          repo_id: repo.id,
          user_id: auth.user_id,
          dev_label: auth.label,
          paths: footprint,
          note: `working: ${task.title}`.slice(0, 300),
          task_id: id,
          expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
        })
        .select("id")
        .single();
      claim_id = claim?.id ?? null;
    }
    return NextResponse.json({
      ok: true,
      started: task.title,
      lane_claimed: footprint,
      claim_id,
      note:
        footprint.length > 0
          ? "Your lane is claimed — teammates' Claudes will route around these paths for 8h (released automatically when the task completes)."
          : "No footprint predicted yet — no lane claimed; check who_is_editing before touching shared files.",
    });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
