"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

export async function toggleRule(formData: FormData): Promise<void> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const repoId = String(formData.get("repoId") || "");
  const rule = String(formData.get("rule") || "");
  const enabled = String(formData.get("enabled")) === "true";
  if (!repoId || !rule) return;

  const admin = supabaseAdmin();
  // Verify membership via RLS-scoped read before writing with service role.
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  await admin.from("policies").upsert(
    {
      org_id: repo.org_id,
      repo_id: repo.id,
      rule,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "repo_id,rule" },
  );
  await admin.from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "rule_change",
    payload: { rule, enabled, by: user.email ?? user.id },
  });
  revalidatePath(`/dashboard/${repoId}/rules`);
}
