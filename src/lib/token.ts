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
    .select("id, org_id, user_id, label, last_used_at, parent_token_id")
    .eq("token_hash", hashToken(token))
    .is("revoked_at", null)
    .single();
  if (!data) return null;
  // Last use, stamped at most every 5 minutes so the hot path stays a
  // single read. Best effort: a failed stamp must never fail the request.
  const last = data.last_used_at ? Date.parse(data.last_used_at) : 0;
  if (Date.now() - last > 5 * 60_000) {
    admin.from("dev_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id).then(() => {}, () => {});
  }
  return { org_id: data.org_id, user_id: data.user_id, label: data.label, token_id: data.id as string, parent_token_id: (data.parent_token_id as string | null) ?? null };
}
