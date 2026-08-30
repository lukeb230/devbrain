import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { cleanLabel, nextLabel } from "@/lib/spawn-label";
import { hashToken, resolveDevToken } from "@/lib/token";

// ============================================================================
// Child tokens — spawned sessions as first-class teammates.
//   POST { action:"mint", label? }   → { token, label, id }   (plaintext ONCE)
//   POST { action:"revoke", id }     → releases the child's claims, ends its
//                                      sessions, revokes the token
//   POST { action:"list" }           → caller's live children
// Auth: Bearer <dev token>. One level deep: a child cannot mint. A parent may
// hold at most 8 live children — this is session provisioning, not an API for
// minting service credentials.
// ============================================================================

const MAX_CHILDREN = 8;

export async function POST(request: Request) {
  const auth = await resolveDevToken(request.headers.get("authorization"));
  if (!auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const action = String(body?.action || "mint");
  const admin = supabaseAdmin();

  if (action === "mint") {
    if (auth.parent_token_id) {
      return NextResponse.json({ error: "a spawned session cannot spawn sessions — mint from the parent identity" }, { status: 403 });
    }
    const { data: children } = await admin
      .from("dev_tokens")
      .select("id, label")
      .eq("parent_token_id", auth.token_id)
      .is("revoked_at", null);
    if ((children ?? []).length >= MAX_CHILDREN) {
      return NextResponse.json({ error: `limit reached — ${MAX_CHILDREN} live spawned sessions per identity` }, { status: 409 });
    }
    const label =
      cleanLabel(body?.label) ?? nextLabel(auth.label, (children ?? []).map((c) => c.label));
    const token = "dbk_" + randomBytes(24).toString("hex");
    const { data: row, error } = await admin
      .from("dev_tokens")
      .insert({
        org_id: auth.org_id,
        user_id: auth.user_id,
        label,
        token_hash: hashToken(token),
        parent_token_id: auth.token_id,
      })
      .select("id, label")
      .single();
    if (error) {
      // The live-label unique index: someone (or something) already wears
      // this name. A clear 409 beats two teammates sharing a badge.
      if (/duplicate|unique/i.test(error.message)) {
        return NextResponse.json({ error: `label "${label}" is already in use` }, { status: 409 });
      }
      return NextResponse.json({ error: "mint failed" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: row.id, label: row.label, token });
  }

  if (action === "revoke") {
    const id = String(body?.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data: child } = await admin
      .from("dev_tokens")
      .select("id, label, user_id")
      .eq("id", id)
      .eq("parent_token_id", auth.token_id)
      .is("revoked_at", null)
      .maybeSingle();
    if (!child) return NextResponse.json({ error: "not your live child token" }, { status: 404 });
    const now = new Date().toISOString();
    // Order matters for the panel: claims and presence close before the token
    // dies, so a hard-killed session can't leave a phantom teammate behind.
    await admin.from("claims").update({ released_at: now }).eq("org_id", auth.org_id).ilike("dev_label", child.label.replace(/[%_\\]/g, "\\$&")).is("released_at", null);
    await admin.from("sessions").update({ ended_at: now }).eq("org_id", auth.org_id).ilike("dev_label", child.label.replace(/[%_\\]/g, "\\$&")).is("ended_at", null);
    await admin.from("dev_tokens").update({ revoked_at: now }).eq("id", child.id);
    return NextResponse.json({ ok: true, revoked: child.label });
  }

  if (action === "list") {
    const { data: children } = await admin
      .from("dev_tokens")
      .select("id, label, created_at, last_used_at")
      .eq("parent_token_id", auth.token_id)
      .is("revoked_at", null)
      .order("created_at");
    const out = [];
    for (const c of children ?? []) {
      const { count } = await admin
        .from("claims")
        .select("id", { count: "exact", head: true })
        .eq("org_id", auth.org_id)
        .ilike("dev_label", c.label.replace(/[%_\\]/g, "\\$&"))
        .is("released_at", null);
      out.push({ ...c, open_claims: count ?? 0 });
    }
    return NextResponse.json({ children: out });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
