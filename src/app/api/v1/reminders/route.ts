import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { resolveDevToken } from "@/lib/token";
import { PRIORITY_MAP, parseTitle } from "@/lib/reminders";

// ============================================================================
// Reminders sync — a Mac-side collector posts the contents of a shared Apple
// Reminders list here; each reminder becomes (or updates) a task.
//
// Body: {
//   list: "Team Inbox",            // routed via the org's list → repo mapping
//   repo?: "owner/name",          // legacy collectors; ignored when a mapping exists
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
  if (!Array.isArray(body?.items)) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  const admin = supabaseAdmin();

  // Route by the team's list → repo mapping (Settings → Reminders). The
  // collector may still send a legacy `repo`; a mapping always wins so two
  // Macs can never send the same list to different repos.
  const listName = String(body.list ?? "").trim();
  let repo: { id: string; org_id: string } | null = null;
  if (listName) {
    const { data: src } = await admin
      .from("reminder_sources")
      .select("repo_id")
      .eq("org_id", auth.org_id)
      .ilike("list_name", listName.replace(/[%_\\]/g, "\\$&"))
      .maybeSingle();
    if (src) {
      const { data: r } = await admin.from("linked_repos").select("id, org_id").eq("id", src.repo_id).single();
      repo = r ?? null;
    }
    // Remember the list either way, so it can be mapped from the dashboard.
    await admin.from("reminder_sightings").upsert(
      { org_id: auth.org_id, list_name: listName.slice(0, 120), seen_by: auth.label, item_count: body.items.length, last_seen: new Date().toISOString() },
      { onConflict: "org_id,list_name" },
    );
  }
  if (!repo && body.repo) {
    const { data: r } = await admin
      .from("linked_repos")
      .select("id, org_id")
      .ilike("full_name", String(body.repo).replace(/[%_\\]/g, "\\$&"))
      .eq("org_id", auth.org_id)
    .is("unlinked_at", null)
      .single();
    repo = r ?? null;
  }
  if (!repo) {
    return NextResponse.json({ ok: true, skipped: true, reason: listName ? "list not mapped to a repo — map it on Settings → Reminders" : "repo not linked" });
  }

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
