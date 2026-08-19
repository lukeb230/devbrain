"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

function devName(user: { email?: string | null; user_metadata?: Record<string, unknown> }) {
  const m = user.user_metadata ?? {};
  return String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
}

async function authedRepo(repoId: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // RLS-scoped read proves membership before service-role writes.
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return null;
  return { user, repo };
}

export async function createTask(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const title = String(formData.get("title") || "").trim().slice(0, 200);
  const detail = String(formData.get("detail") || "").trim().slice(0, 1000) || null;
  const priority = Math.min(4, Math.max(1, Number(formData.get("priority")) || 3));
  const preset = formData.getAll("tags").map(String);
  const custom = String(formData.get("customTags") || "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 5);
  const tags = [...new Set([...preset, ...custom])].slice(0, 8);
  if (!repoId || !title) return;

  const ctx = await authedRepo(repoId);
  if (!ctx) return;

  const assigned = String(formData.get("assignee") || "").trim();
  await supabaseAdmin().from("tasks").insert({
    org_id: ctx.repo.org_id,
    repo_id: ctx.repo.id,
    title,
    detail,
    priority,
    tags,
    created_by: devName(ctx.user),
    assigned_to: assigned || null,
  });
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
}

export async function assignTask(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  const assignee = String(formData.get("assignee") || "").trim();
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("tasks")
    .update({ assigned_to: assignee || null })
    .eq("id", id)
    .eq("org_id", ctx.repo.org_id);
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
}

export async function completeTask(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("tasks")
    .update({ status: "done", done_at: new Date().toISOString(), done_by: devName(ctx.user) })
    .eq("id", id)
    .eq("org_id", ctx.repo.org_id);
  // Completing a task releases its lane claims automatically.
  await supabaseAdmin()
    .from("claims")
    .update({ released_at: new Date().toISOString() })
    .eq("task_id", id)
    .is("released_at", null);
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
}

export async function reopenTask(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("tasks")
    .update({ status: "open", done_at: null, done_by: null })
    .eq("id", id)
    .eq("org_id", ctx.repo.org_id);
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
}

// ============================================================================
// Braindump → tasks. Built for dictation (Wispr Flow): paste/speak a rambling
// stream into the box, the splitter agent turns it into scoped, prioritized,
// tagged tasks deduped against the board. Without an API key it falls back to
// one task per line — the box always works.
// ============================================================================
export async function braindumpTasks(formData: FormData): Promise<void> {
  const { agentConfigured, askClaude, BRAINDUMP_SYSTEM, extractJson } = await import("@/lib/agent");

  const repoId = String(formData.get("repoId") || "");
  const dump = String(formData.get("dump") || "").trim().slice(0, 8000);
  if (!repoId || !dump) return;

  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  const admin = supabaseAdmin();

  const { data: existing } = await admin
    .from("tasks")
    .select("title")
    .eq("repo_id", ctx.repo.id)
    .eq("status", "open")
    .limit(100);
  const existingTitles = (existing ?? []).map((t) => t.title);

  const VALID_TAGS = new Set(["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"]);
  let parsed: { title: string; detail: string | null; priority: number; tags: string[] }[] = [];

  if (agentConfigured()) {
    try {
      const raw = await askClaude(
        BRAINDUMP_SYSTEM,
        `EXISTING OPEN TASKS (skip duplicates):\n${existingTitles.map((t) => `- ${t}`).join("\n") || "(none)"}\n\nBRAINDUMP:\n${dump}`,
        1500,
      );
      const obj = extractJson(raw);
      const arr = Array.isArray(obj?.tasks) ? (obj!.tasks as Record<string, unknown>[]) : [];
      parsed = arr
        .filter((t) => typeof t.title === "string" && String(t.title).trim())
        .slice(0, 15)
        .map((t) => ({
          title: String(t.title).trim().slice(0, 200),
          detail: typeof t.detail === "string" && t.detail.trim() ? t.detail.trim().slice(0, 1000) : null,
          priority: Math.min(4, Math.max(1, Number(t.priority) || 3)),
          tags: Array.isArray(t.tags)
            ? (t.tags as unknown[]).map((x) => String(x).toLowerCase()).filter((x) => VALID_TAGS.has(x)).slice(0, 4)
            : [],
        }));
    } catch {
      parsed = []; // fall through to line-split
    }
  }

  if (parsed.length === 0) {
    // No key (or the agent choked): one task per non-empty line, P3, no tags.
    const lower = new Set(existingTitles.map((t) => t.toLowerCase()));
    parsed = dump
      .split(/\n|(?:^|\s)[-*•]\s/)
      .map((l) => l.trim())
      .filter((l) => l.length > 3)
      .slice(0, 15)
      .map((l) => ({ title: l.slice(0, 200), detail: null, priority: 3, tags: [] }))
      .filter((t) => !lower.has(t.title.toLowerCase()));
  }
  if (parsed.length === 0) return;

  const by = devName(ctx.user);
  await admin.from("tasks").insert(
    parsed.map((t) => ({
      org_id: ctx.repo.org_id,
      repo_id: ctx.repo.id,
      title: t.title,
      detail: t.detail,
      priority: t.priority,
      tags: t.tags,
      created_by: by,
    })),
  );
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
  revalidatePath("/widget");
}

// "Possibly done by PR #N" — human resolves the AI's medium-confidence match.
export async function confirmMaybeDone(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  const { data: task } = await supabaseAdmin()
    .from("tasks")
    .select("maybe_done_pr")
    .eq("id", id)
    .single();
  await supabaseAdmin()
    .from("tasks")
    .update({
      status: "done",
      done_by: `${devName(ctx.user)}${task?.maybe_done_pr ? ` · PR #${task.maybe_done_pr}` : ""}`,
      done_at: new Date().toISOString(),
      maybe_done_pr: null,
    })
    .eq("id", id)
    .eq("repo_id", ctx.repo.id)
    .eq("status", "open");
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
  revalidatePath("/widget");
}

export async function dismissMaybeDone(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("tasks")
    .update({ maybe_done_pr: null })
    .eq("id", id)
    .eq("repo_id", ctx.repo.id);
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath("/widget");
}

// Start a task from the dashboard: take it + claim its predicted lane (8h,
// auto-released on completion). Same semantics as the plugin's start_task.
export async function startTask(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  const admin = supabaseAdmin();
  const me = devName(ctx.user);

  const { data: task } = await admin
    .from("tasks")
    .select("id, title, footprint, started_by, status")
    .eq("id", id)
    .eq("repo_id", ctx.repo.id)
    .single();
  if (!task || task.status !== "open") return;
  if (task.started_by && task.started_by.toLowerCase() !== me.toLowerCase()) return;

  await admin
    .from("tasks")
    .update({ started_by: me, started_at: new Date().toISOString(), assigned_to: me })
    .eq("id", id);
  const footprint = Array.isArray(task.footprint) ? (task.footprint as string[]) : [];
  if (footprint.length > 0) {
    await admin.from("claims").insert({
      org_id: ctx.repo.org_id,
      repo_id: ctx.repo.id,
      user_id: ctx.user.id,
      dev_label: me,
      paths: footprint,
      note: `working: ${task.title}`.slice(0, 300),
      task_id: id,
      expires_at: new Date(Date.now() + 8 * 3600_000).toISOString(),
    });
  }
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
  revalidatePath("/widget");
}
