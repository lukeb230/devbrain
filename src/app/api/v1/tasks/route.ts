import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";
import { pickSuggestedNext } from "@/lib/lanes";

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
    // GitHub repo names are case-insensitive; git remotes are typed however
    // the human typed them. Match without case (ilike, wildcards escaped).
    .ilike("full_name", String(repoFull).replace(/[%_\\]/g, "\\$&"))
    .eq("org_id", auth.org_id)
    .is("unlinked_at", null)
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
    // Take the task in ONE conditional update, so two teammates polling the
    // board at the same moment can't both pass a check-then-write. Zero rows
    // back means somebody else has it (or it isn't open) — we look to say which.
    const label = auth.label.replace(/[%_\\]/g, "\\$&");
    const { data: taken } = await admin
      .from("tasks")
      .update({ started_by: auth.label, started_at: new Date().toISOString(), assigned_to: auth.label })
      .eq("id", id)
      .eq("repo_id", repo.id)
      .eq("status", "open")
      .or(`started_by.is.null,started_by.ilike.${label}`)
      .select("id, title, footprint");
    const task = taken?.[0];
    if (!task) {
      const { data: why } = await admin.from("tasks").select("started_by, status").eq("id", id).eq("repo_id", repo.id).maybeSingle();
      if (!why) return NextResponse.json({ error: "task not found" }, { status: 404 });
      if (why.status !== "open") return NextResponse.json({ error: "task is not open" }, { status: 400 });
      return NextResponse.json({ error: `already started by ${why.started_by}` }, { status: 409 });
    }
    const footprint = Array.isArray(task.footprint) ? (task.footprint as string[]) : [];
    let claim_id: string | null = null;
    if (footprint.length > 0) {
      // Idempotent: restarting your own task keeps the lane you already hold
      // instead of stacking a fresh 8h claim on top of it every time.
      const { data: held } = await admin
        .from("claims")
        .select("id")
        .eq("task_id", id)
        .ilike("dev_label", label)
        .is("released_at", null)
        .limit(1);
      if (held?.[0]) {
        claim_id = held[0].id;
        await admin.from("claims").update({ expires_at: new Date(Date.now() + 8 * 3600_000).toISOString() }).eq("id", claim_id);
      } else {
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

  // Dispatch: the highest-priority open task whose predicted lane doesn't
  // overlap anyone else's active claims or started work. Returns the pick —
  // it does NOT start it; the caller decides, then calls start_task (atomic).
  if (action === "next") {
    const [{ data: tasks }, { data: claims }] = await Promise.all([
      admin
        .from("tasks")
        .select("id, title, priority, tags, assigned_to, started_by, footprint, created_at")
        .eq("repo_id", repo.id)
        .eq("status", "open")
        .order("priority")
        .order("created_at"),
      admin
        .from("claims")
        .select("dev_label, paths")
        .eq("repo_id", repo.id)
        .is("released_at", null)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`),
    ]);
    const you = auth.label.toLowerCase();
    const busy: string[] = [];
    for (const c of claims ?? []) {
      if (String(c.dev_label ?? "").toLowerCase() === you) continue;
      for (const p of (c.paths as string[]) ?? []) busy.push(p);
    }
    for (const t of tasks ?? []) {
      if (!t.started_by || t.started_by.toLowerCase() === you) continue;
      for (const p of (t.footprint as string[] | null) ?? []) busy.push(p);
    }
    const pick = pickSuggestedNext(
      (tasks ?? []).map((t) => ({
        id: t.id,
        title: t.title,
        priority: t.priority,
        tags: (t.tags as string[]) ?? [],
        assigned_to: t.assigned_to,
        started_by: t.started_by,
        footprint: (t.footprint as string[] | null) ?? null,
        created_at: t.created_at,
      })),
      auth.label,
      busy,
    );
    return NextResponse.json(
      pick
        ? { ok: true, next: pick }
        : { ok: true, next: null, reason: (tasks ?? []).length === 0 ? "the board is empty" : "every open task overlaps someone's active lane" },
    );
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
