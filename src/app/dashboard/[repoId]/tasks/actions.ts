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
