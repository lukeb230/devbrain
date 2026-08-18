"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRevertPr } from "@/lib/github-writer";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// One-click revert from the History tab. Hard gates, in order:
//   1. signed-in org member (RLS-scoped repo read)
//   2. writer app connected to this repo
//   3. writer_revert_pr policy toggled ON for this repo
// The write itself is branch + PR only; an audit event is always recorded.
export async function revertFromHistory(formData: FormData): Promise<void> {
  const repoId = String(formData.get("repoId") || "");
  const beforeSha = String(formData.get("before") || "");
  const afterSha = String(formData.get("sha") || "");
  const label = String(formData.get("label") || "").slice(0, 160);
  if (!repoId || !beforeSha || !afterSha) return;

  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, org_id, full_name, default_branch, writer_installation_id")
    .eq("id", repoId)
    .single();
  if (!repo || !repo.writer_installation_id) return;

  const admin = supabaseAdmin();
  const { data: policy } = await admin
    .from("policies")
    .select("enabled")
    .eq("repo_id", repo.id)
    .eq("rule", "writer_revert_pr")
    .single();
  if (!policy?.enabled) return; // default off — must be explicitly enabled

  const by =
    String(
      (user.user_metadata as Record<string, unknown> | null)?.user_name ||
        user.email?.split("@")[0] ||
        "someone",
    );

  let prUrl = "";
  try {
    const result = await createRevertPr({
      installationId: repo.writer_installation_id,
      fullName: repo.full_name,
      beforeSha,
      afterSha,
      defaultBranch: repo.default_branch,
      label: label || afterSha.slice(0, 7),
      requestedBy: by,
    });
    prUrl = result.prUrl;
    await admin.from("events").insert({
      org_id: repo.org_id,
      repo_id: repo.id,
      kind: "bot_write",
      payload: {
        action: "revert_pr",
        text: `Revert PR #${result.prNumber} created for "${label}" by ${by} (${result.restored} file changes)`,
        by,
        pr: result.prNumber,
        url: result.prUrl,
      },
    });
  } catch (err) {
    await admin.from("events").insert({
      org_id: repo.org_id,
      repo_id: repo.id,
      kind: "error",
      payload: { where: "revert_pr", message: String((err as Error)?.message ?? err), by },
    });
    revalidatePath(`/dashboard/${repoId}/history`);
    return;
  }

  revalidatePath(`/dashboard/${repoId}/history`);
  redirect(prUrl);
}
