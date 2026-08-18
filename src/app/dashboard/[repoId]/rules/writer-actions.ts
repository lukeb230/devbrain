"use server";

import { revalidatePath } from "next/cache";
import { findWriterInstallation } from "@/lib/github-writer";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Connect the writer app to a repo: after the team installs the writer
// GitHub App on it, this looks up the installation and records it. Write
// features stay OFF until their policy toggles are also enabled.
export async function connectWriter(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  if (!repoId) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id, full_name")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const installationId = await findWriterInstallation(repo.full_name);
  const admin = supabaseAdmin();
  await admin
    .from("linked_repos")
    .update({ writer_installation_id: installationId })
    .eq("id", repo.id);
  await admin.from("events").insert({
    org_id: repo.org_id,
    repo_id: repo.id,
    kind: "bot_write",
    payload: {
      action: installationId ? "writer_connected" : "writer_disconnected",
      text: installationId
        ? `Writer app connected to ${repo.full_name} (installation ${installationId})`
        : `Writer app not found on ${repo.full_name} — install it first, then reconnect`,
      by: user.email ?? user.id,
    },
  });
  revalidatePath(`/dashboard/${repoId}/rules`);
}
