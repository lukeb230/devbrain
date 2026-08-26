import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";
import { PRIORITY_MAP, parseTitle } from "@/lib/reminders";

// ============================================================================
// Reminders sync — a Mac-side collector posts the contents of a shared Apple
// Reminders list here; each reminder becomes (or updates) a task.
//
// Body: {
//   repo: "owner/name",
//   items: [{ id, title, notes?, priority?, completed?, due? }]
// }
//   id        — the reminder's stable identifier (dedupe key)
//   priority  — Apple's CalDAV scale: 0 none, 1 high, 5 medium, 9 low
//   completed — checked off in Reminders → task completes here
//
// Conventions parsed out of the title (Apple exposes neither the shared-list
// assignee nor hashtag tags through EventKit/AppleScript, so they ride in
// the text): "@ethan" → assigned_to, "#export" → tag. Both are stripped
// from the stored title.
//
// Auth: Bearer <dev token> — same as /api/v1/ingest. Idempotent: keyed on
// (repo_id, external_ref); safe for two Macs to run collectors on one list.
// ============================================================================

interface Item {
  id?: string;
  title?: string;
  notes?: string;
  priority?: number;
  completed?: boolean;
  due?: string;
}

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body?.repo || !Array.isArray(body.items)) {
    return NextResponse.json({ error: "repo and items required" }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: repo } = await admin
    .from("linked_repos")
    .select("id, org_id")
    .eq("full_name", body.repo)
    .eq("org_id", auth.org_id)
    .single();
  if (!repo) return NextResponse.json({ error: "repo not linked" }, { status: 404 });

  const items = (body.items as Item[]).filter((i) => i?.id && String(i.title || "").trim()).slice(0, 100);
  if (items.length === 0) return NextResponse.json({ ok: true, created: 0, updated: 0, completed: 0 });

  const refs = items.map((i) => String(i.id));
  const { data: existing } = await admin
    .from("tasks")
    .select("id, external_ref, status, title, detail, priority, tags, assigned_to")
    .eq("repo_id", repo.id)
    .in("external_ref", refs);
  const byRef = new Map((existing ?? []).map((t) => [String(t.external_ref), t]));

  let created = 0, updated = 0, completed = 0;

  for (const item of items) {
    const ref = String(item.id);
    const { title, assignee, tags } = parseTitle(String(item.title));
    if (!title) continue;
    const priority = PRIORITY_MAP[Number(item.priority) as 0 | 1 | 5 | 9] ?? 3;
    const detailBits = [String(item.notes || "").trim().slice(0, 900)].filter(Boolean);
    if (item.due) detailBits.push(`Due: ${String(item.due).slice(0, 40)}`);
    const detail = detailBits.join("\n\n") || null;
    const done = Boolean(item.completed);
    const prev = byRef.get(ref);

    if (!prev) {
      if (done) continue; // never import already-finished reminders
      const { error } = await admin.from("tasks").insert({
        org_id: repo.org_id,
        repo_id: repo.id,
        title,
        detail,
        priority,
        tags,
        created_by: `${auth.label} (reminders)`,
        assigned_to: assignee,
        external_ref: ref,
      });
      if (!error) created++;
      continue;
    }

    if (done && prev.status === "open") {
      await admin
        .from("tasks")
        .update({ status: "done", done_at: new Date().toISOString(), done_by: `${auth.label} (reminders)` })
        .eq("id", prev.id);
      await admin
        .from("claims")
        .update({ released_at: new Date().toISOString() })
        .eq("task_id", prev.id)
        .is("released_at", null);
      completed++;
      continue;
    }

    // Open reminder edited on a phone → carry the edit through, but never
    // overwrite an assignment made on the dashboard with a blank.
    if (!done && prev.status === "open") {
      const next: Record<string, unknown> = {};
      if (title !== prev.title) next.title = title;
      if (detail !== prev.detail) next.detail = detail;
      if (priority !== prev.priority) next.priority = priority;
      if (JSON.stringify(tags) !== JSON.stringify(prev.tags ?? [])) next.tags = tags;
      if (assignee && assignee !== prev.assigned_to) next.assigned_to = assignee;
      if (Object.keys(next).length > 0) {
        const { error } = await admin.from("tasks").update(next).eq("id", prev.id);
        if (!error) updated++;
      }
    }
  }

  return NextResponse.json({ ok: true, created, updated, completed });
}
