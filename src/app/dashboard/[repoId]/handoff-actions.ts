"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

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
