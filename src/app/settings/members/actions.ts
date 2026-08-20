"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// Manage the allowlist from the dashboard instead of Vercel env vars.
// Any signed-in member can invite — this is a 3-person team tool, not a
// permissions product; every add is attributed and visible to everyone.

async function currentMember() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: membership } = await supabaseAdmin()
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();
  if (!membership) return null;
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const label = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "someone");
  return { orgId: membership.org_id, label };
}

export async function addMember(formData: FormData): Promise<void> {
  const me = await currentMember();
  if (!me) return;
  // Accept a bare username or a pasted profile URL.
  const raw = String(formData.get("login") || "").trim();
  const login = raw
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/^@/, "")
    .split("/")[0]
    .trim()
    .toLowerCase();
  if (!login || !/^[a-z0-9-]{1,39}$/.test(login)) return;

  await supabaseAdmin().from("allowed_members").upsert(
    {
      login,
      org_id: me.orgId,
      invited_by: me.label,
      note: String(formData.get("note") || "").trim().slice(0, 200) || null,
    },
    { onConflict: "login" },
  );
  revalidatePath("/settings/members");
}

export async function removeMember(formData: FormData): Promise<void> {
  const me = await currentMember();
  if (!me) return;
  const login = String(formData.get("login") || "").trim().toLowerCase();
  if (!login) return;
  await supabaseAdmin().from("allowed_members").delete().eq("login", login).eq("org_id", me.orgId);
  revalidatePath("/settings/members");
}
