"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, clearDevbrainCookies } from "@/lib/cookies";
import { currentOrg, requireRoleOrRedirect, type Role } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";

// Members page: invite links (admin+), roles and removal (owner).

export async function createInvite(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/settings/members");
  const role = formData.get("role") === "admin" ? "admin" : "member";
  const single = formData.get("single") === "on";
  await supabaseAdmin().from("org_invites").insert({
    org_id: me.orgId,
    code: randomBytes(12).toString("base64url"),
    role,
    created_by: me.login,
    max_uses: single ? 1 : null,
  });
  revalidatePath("/settings/members");
}

export async function revokeInvite(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("admin", "/settings/members");
  const id = String(formData.get("id") || "");
  await supabaseAdmin().from("org_invites").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("org_id", me.orgId);
  revalidatePath("/settings/members");
}

export async function setRole(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/members");
  const userId = String(formData.get("userId") || "");
  const role = String(formData.get("role") || "") as Role;
  if (!["owner", "admin", "member"].includes(role) || !userId) return;
  const admin = supabaseAdmin();
  if (userId === me.userId && role !== "owner") {
    // Never demote the last owner.
    const { count } = await admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner");
    if ((count ?? 0) <= 1) return;
  }
  await admin.from("org_members").update({ role }).eq("org_id", me.orgId).eq("user_id", userId);
  revalidatePath("/settings/members");
}

export async function removeMember(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/members");
  const userId = String(formData.get("userId") || "");
  if (!userId || userId === me.userId) return;
  const admin = supabaseAdmin();
  await admin.from("org_members").delete().eq("org_id", me.orgId).eq("user_id", userId);
  // Their machines stop talking to this org too.
  await admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("org_id", me.orgId).eq("user_id", userId).is("revoked_at", null);
  revalidatePath("/settings/members");
}

export async function leaveOrg(): Promise<void> {
  const me = await currentOrg();
  if (!me) return;
  const admin = supabaseAdmin();
  if (me.role === "owner") {
    const { count } = await admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner");
    if ((count ?? 0) <= 1) return; // hand ownership over first
  }
  await admin.from("org_members").delete().eq("org_id", me.orgId).eq("user_id", me.userId);
  await admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("org_id", me.orgId).eq("user_id", me.userId).is("revoked_at", null);
  clearDevbrainCookies(await cookies(), [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
  redirect("/dashboard"); // falls back to another membership, or /welcome
}
