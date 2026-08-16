import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Resolve a Bearer dev token → {org_id, user_id, label} or null. */
export async function resolveDevToken(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const admin = supabaseAdmin();
  const { data } = await admin
    .from("dev_tokens")
    .select("org_id, user_id, label")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .single();
  return data ?? null;
}
