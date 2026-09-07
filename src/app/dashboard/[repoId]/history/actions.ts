"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRevertPr } from "@/lib/github-writer";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { canRevert } from "@/lib/writer-gates";

// One-click revert from the History tab. Hard gates, in order:
//   1. signed-in org member (RLS-scoped repo read)
//   2. the repo's writer_revert_pr switch is ON (admins set it; default off)
//   3. the main app's installation exists on the repo
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
    .select("id, org_id, full_name, default_branch, installation_id")
    .eq("id", repoId)
    .single();
  if (!repo) return;

  const admin = supabaseAdmin();
  const { data: policy } = await admin
    .from("policies")
    .select("enabled")
    .eq("repo_id", repo.id)
    .eq("rule", "writer_revert_pr")
    .maybeSingle();
  if (!canRevert({ policyOn: policy?.enabled, installationId: repo.installation_id })) return; // default off

  const by =
    String(
      (user.user_metadata as Record<string, unknown> | null)?.user_name ||
        user.email?.split("@")[0] ||
        "someone",
    );

  let prUrl = "";
  try {
    const result = await createRevertPr({
      installationId: repo.installation_id,
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
