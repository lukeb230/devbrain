"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, NEW_TOKEN_COOKIE_OPTS } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { returnTo, surfaceOf } from "@/lib/surface";
import { hashToken } from "@/lib/token";

// Server actions for self-serve dev tokens. Each signed-in member manages
// their OWN tokens; the plaintext token is returned exactly once.

async function currentMember() {
  const ctx = await currentOrg();
  return ctx ? { userId: ctx.userId, orgId: ctx.orgId } : null;
}

export async function createToken(formData: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) redirect("/welcome"); // no team yet — nothing to attach a token to
  const label =
    String(formData.get("label") || "").trim().slice(0, 60) || "my-machine";
  // Subscription before access: no new machines for a walled team.
  const { loadBilling } = await import("@/lib/billing/usage");
  const { wallReason } = await import("@/lib/billing/wall");
  const b = await loadBilling(member.orgId);
  if (b && wallReason({ status: b.status, hasSubscription: b.hasSubscription, trialEndsAt: b.trialEndsAt, periodEnd: b.periodEnd })) redirect("/desk/plan");

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
  // Scoped to the surface that asked: /settings for the dashboard (so the
  // Setup page can embed it in the connect command), /desk for the Desk.
  const path = surfaceOf(returnTo(formData, "/settings/tokens")) === "desk" ? "/desk" : "/settings";
  (await cookies()).set(COOKIE.newToken, token, { ...NEW_TOKEN_COOKIE_OPTS, path });
  revalidatePath("/settings/tokens");
  revalidatePath("/settings/setup");
  revalidatePath("/desk", "layout");
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
  revalidatePath("/desk", "layout");
}
