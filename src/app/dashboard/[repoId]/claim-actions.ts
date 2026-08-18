"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Human releasing a claim from the dashboard. Any member may — claims are
// soft locks, and a stale lock is worse than a generous unlock.
export async function releaseClaim(formData: FormData): Promise<void> {
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

  await supabaseAdmin()
    .from("claims")
    .update({ released_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", repo.org_id)
    .is("released_at", null);
  revalidatePath(`/dashboard/${repoId}`);
}
