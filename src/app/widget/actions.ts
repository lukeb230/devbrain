"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { COOKIE, LAST_REPO_COOKIE_OPTS } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hashToken } from "@/lib/token";

// Widget repo switcher — sets the same cookie the middleware writes when you
// visit a repo on the dashboard, so the widget and dashboard stay in sync on
// "the repo you're working in".
export async function setWidgetRepo(repoId: string): Promise<void> {
  const id = String(repoId || "");
  const isAll = id === "all";
  if (!isAll && !/^[0-9a-f-]{36}$/.test(id)) return;

  if (!isAll) {
    // RLS-scoped read proves the repo belongs to the caller's org.
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: repo } = await supabase
      .from("linked_repos")
      .select("id, org_id")
      .eq("id", id)
      .single();
    const org = await currentOrg();
    if (!repo || !org || repo.org_id !== org.orgId) return;
  }

  (await cookies()).set(COOKIE.lastRepo, id, LAST_REPO_COOKIE_OPTS);
  revalidatePath("/widget");
  revalidatePath("/desk", "layout");
}

// First-run setup inside the desktop app: mint a dev token for THIS device on
// behalf of the signed-in member and return the plaintext once. The app
// writes it to ~/.devbrain/config.json; the server only ever keeps the hash.
// Same rules as the Tokens page — a member can only mint for themselves.
export async function mintDeviceToken(labelRaw: string, orgId?: string): Promise<{ token: string; label: string; team: string } | { error: string }> {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "not signed in" };
  const admin = supabaseAdmin();
  const ctx = await currentOrg();
  if (!ctx) return { error: "not a member of any team yet — create or join one first" };
  // Which team this Mac joins is explicit: the app window's idea of the
  // "active" team can lag the browser where the person just created or
  // switched one, and silently attaching a Mac to the wrong team is worse
  // than asking. Anything passed must be a team they belong to — the copy
  // that led here named that team, so a mismatch is an error, not a fallback.
  if (orgId && !ctx.orgs.some((o) => o.id === orgId)) return { error: "you are not a member of that team" };
  const wanted = orgId || ctx.orgId;
  const membership = { org_id: wanted };
  const teamName = ctx.orgs.find((o) => o.id === wanted)?.name ?? ctx.orgName;
  const label = String(labelRaw || "").trim().slice(0, 60) || "devbrain-app";
  // "This Mac" wears one token, named after the machine. Live labels are
  // unique per user across teams (dev_tokens_live_label_per_user), so a
  // re-run — same team after a lost config, or a switch to another team —
  // must replace the Mac's previous token, not fail on its name. The old
  // token is dead anyway: the CLI overwrites config.json with the new one.
  // Only this user's own top-level tokens are touched.
  await admin
    .from("dev_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .is("parent_token_id", null)
    .ilike("label", label.replace(/[%_\\]/g, "\\$&"));
  const token = "dbk_" + randomBytes(24).toString("hex");
  const { error } = await admin.from("dev_tokens").insert({
    org_id: membership.org_id,
    user_id: user.id,
    label,
    token_hash: hashToken(token),
  });
  if (error) return { error: "could not create token" };
  revalidatePath("/settings/tokens");
  revalidatePath("/desk", "layout");
  return { token, label, team: teamName };
}
