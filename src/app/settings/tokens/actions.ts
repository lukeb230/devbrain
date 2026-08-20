"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { hashToken } from "@/lib/token";

// Server actions for self-serve dev tokens. Each signed-in member manages
// their OWN tokens; the plaintext token is returned exactly once.

async function currentMember() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = supabaseAdmin();
  const { data: membership } = await admin
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return null;
  return { userId: user.id, orgId: membership.org_id };
}

export async function createToken(formData: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) return;
  const label =
    String(formData.get("label") || "").trim().slice(0, 60) || "my-machine";

  const token = "dbk_" + randomBytes(24).toString("hex");
  const admin = supabaseAdmin();
  await admin.from("dev_tokens").insert({
    org_id: member.orgId,
    user_id: member.userId,
    label,
    token_hash: hashToken(token),
  });

  // Stash the plaintext once in a short-lived cookie so the page can show it
  // after the redirect, then it exists nowhere server-side except as a hash.
  const { cookies } = await import("next/headers");
  // Scoped to /settings (not just /tokens) so the Setup page can render the
  // paste-one connect command with the token already embedded.
  (await cookies()).set("devbrain_new_token", token, {
    maxAge: 120,
    httpOnly: false,
    path: "/settings",
  });
  revalidatePath("/settings/tokens");
  revalidatePath("/settings/setup");
}

export async function revokeToken(formData: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  const admin = supabaseAdmin();
  await admin
    .from("dev_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", member.userId); // can only revoke your own
  revalidatePath("/settings/tokens");
}
