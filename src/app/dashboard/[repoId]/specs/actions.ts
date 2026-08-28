"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import {
  fallbackTitle,
  htmlToText,
  kindFor,
  MAX_BODY_CHARS,
  pdfToMarkdown,
  type SourceKind,
} from "@/lib/spec-text";

async function authedRepo(repoId: string) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id, full_name")
    .eq("id", repoId)
    .single();
  if (!repo) return null;
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const label = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  return { repo, label };
}

// Ingest: normalize whatever was dropped into markdown, store it, and leave
// it status='new' for the tick's analysis worker to pick up (~2 min).
export async function uploadSpec(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const ctx = await authedRepo(repoId);
  if (!ctx) return;

  const file = formData.get("file");
  const pasted = String(formData.get("text") || "").trim();
  let body = "";
  let kind: SourceKind = "paste";
  let sourceName: string | null = null;

  if (file && typeof file === "object" && "arrayBuffer" in file) {
    const f = file as File;
    if (f.size > 0) {
      sourceName = f.name;
      kind = kindFor(f.name);
      const buf = Buffer.from(await f.arrayBuffer());
      if (kind === "pdf") {
        try {
          body = await pdfToMarkdown(buf.toString("base64"), ctx.repo.org_id);
        } catch (err) {
          body = "";
          await supabaseAdmin().from("specs").insert({
            org_id: ctx.repo.org_id,
            repo_id: ctx.repo.id,
            title: fallbackTitle(sourceName, ""),
            source_name: sourceName,
            source_kind: kind,
            body: "(PDF could not be read)",
            uploaded_by: ctx.label,
            status: "failed",
            error: String(err).slice(0, 300),
          });
          revalidatePath(`/dashboard/${repoId}/specs`);
          return;
        }
      } else {
        const raw = buf.toString("utf8");
        body = kind === "html" ? htmlToText(raw) : raw;
      }
    }
  }
  if (!body && pasted) {
    body = pasted;
    kind = "paste";
  }
  body = body.trim().slice(0, MAX_BODY_CHARS);
  if (!body) return;

  const { data } = await supabaseAdmin()
    .from("specs")
    .insert({
      org_id: ctx.repo.org_id,
      repo_id: ctx.repo.id,
      title: String(formData.get("title") || "").trim().slice(0, 120) || fallbackTitle(sourceName, body),
      source_name: sourceName,
      source_kind: kind,
      body,
      uploaded_by: ctx.label,
      status: "new",
    })
    .select("id")
    .single();

  revalidatePath(`/dashboard/${repoId}/specs`);
  revalidatePath("/widget");
  // The widget passes stay=1: never navigate the panel to a dashboard URL
  // (that's what used to strand it on the full site).
  if (data?.id && !formData.get("stay")) redirect(`/dashboard/${repoId}/specs/${data.id}`);
}

// Create real tasks from the checked requirements. Footprint prediction picks
// them up on the next tick, so they land in lanes automatically.
export async function createTasksFromItems(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const specId = String(formData.get("specId") || "");
  const ids = formData.getAll("item").map(String).filter(Boolean);
  if (!repoId || !specId || ids.length === 0) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  const admin = supabaseAdmin();

  const { data: items } = await admin
    .from("spec_items")
    .select("id, requirement, detail, suggested_priority, suggested_tags, task_id")
    .eq("spec_id", specId)
    .eq("repo_id", ctx.repo.id)
    .in("id", ids);

  for (const item of items ?? []) {
    if (item.task_id) continue; // already turned into a task
    const { data: task } = await admin
      .from("tasks")
      .insert({
        org_id: ctx.repo.org_id,
        repo_id: ctx.repo.id,
        title: String(item.requirement).slice(0, 200),
        detail: item.detail,
        priority: Math.min(4, Math.max(1, item.suggested_priority || 3)),
        tags: item.suggested_tags ?? [],
        created_by: ctx.label,
      })
      .select("id")
      .single();
    if (task?.id) {
      await admin.from("spec_items").update({ task_id: task.id }).eq("id", item.id);
    }
  }
  revalidatePath(`/dashboard/${repoId}/specs/${specId}`);
  revalidatePath(`/dashboard/${repoId}/tasks`);
  revalidatePath(`/dashboard/${repoId}`);
  revalidatePath("/widget");
}

export async function dismissItem(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const specId = String(formData.get("specId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("spec_items")
    .update({ dismissed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("repo_id", ctx.repo.id);
  revalidatePath(`/dashboard/${repoId}/specs/${specId}`);
}

export async function restoreItem(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const specId = String(formData.get("specId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("spec_items")
    .update({ dismissed_at: null })
    .eq("id", id)
    .eq("repo_id", ctx.repo.id);
  revalidatePath(`/dashboard/${repoId}/specs/${specId}`);
}

export async function deleteSpec(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const specId = String(formData.get("specId") || "");
  if (!repoId || !specId) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin().from("specs").delete().eq("id", specId).eq("repo_id", ctx.repo.id);
  revalidatePath(`/dashboard/${repoId}/specs`);
  redirect(`/dashboard/${repoId}/specs`);
}

// "Analyze now" — re-queue for the worker (also used to retry a failure).
export async function requeueSpec(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const specId = String(formData.get("specId") || "");
  if (!repoId || !specId) return;
  const ctx = await authedRepo(repoId);
  if (!ctx) return;
  await supabaseAdmin()
    .from("specs")
    .update({ status: "new", error: null })
    .eq("id", specId)
    .eq("repo_id", ctx.repo.id);
  revalidatePath(`/dashboard/${repoId}/specs/${specId}`);
}
