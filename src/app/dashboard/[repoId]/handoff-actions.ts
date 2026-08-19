"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Human leaving a handoff from the dashboard — for teammates working outside
// Claude Code who still want their unfinished work visible and resumable.
export async function leaveHandoff(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const summary = String(formData.get("summary") || "").trim().slice(0, 300);
  const remaining = String(formData.get("remaining") || "").trim().slice(0, 1000);
  const branch = String(formData.get("branch") || "").trim().slice(0, 200);
  if (!repoId || !summary) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  await supabaseAdmin().from("handoffs").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    dev_label: name,
    branch: branch || null,
    summary,
    remaining: remaining || null,
  });
  revalidatePath(`/dashboard/${repoId}`);
}

// Team-wide broadcast from the dashboard (mirrors the plugin's broadcast tool).
export async function sendBroadcast(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const text = String(formData.get("text") || "").trim().slice(0, 400);
  if (!repoId || !text) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  await supabaseAdmin().from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "broadcast",
    payload: { text, by: name },
  });
  revalidatePath(`/dashboard/${repoId}`);
}

// A human claiming a handoff from the dashboard (Claudes use the API tool).
export async function pickupHandoff(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const id = String(formData.get("id") || "");
  if (!repoId || !id) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  await supabaseAdmin()
    .from("handoffs")
    .update({ picked_up_by: name, picked_up_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", repo.org_id)
    .is("picked_up_at", null);
  revalidatePath(`/dashboard/${repoId}`);
}
