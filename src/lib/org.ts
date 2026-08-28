import { cache } from "react";
import { cookies } from "next/headers";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// ============================================================================
// Active org. A user may belong to several orgs; the `devbrain_org` cookie
// says which one the dashboard is looking at. It is only ever trusted after
// checking the membership row, and falls back to the earliest membership.
// Every page and server action goes through here instead of picking
// "org_members … limit(1)" on its own.
// ============================================================================

export const ORG_COOKIE = "devbrain_org";
export type Role = "owner" | "admin" | "member";
const RANK: Record<Role, number> = { owner: 3, admin: 2, member: 1 };

export type OrgContext = {
  userId: string;
  login: string;             // GitHub login (or email prefix) for attribution
  orgId: string;
  orgName: string;
  orgSlug: string;
  role: Role;
  orgs: { id: string; name: string; role: Role }[];   // every membership, for the switcher
};

export const currentOrg = cache(async (): Promise<OrgContext | null> => {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: rows } = await supabaseAdmin()
    .from("org_members")
    .select("org_id, role, created_at, orgs(name, slug)")
    .eq("user_id", user.id)
    .order("created_at");
  if (!rows || rows.length === 0) return null;
  const wanted = (await cookies()).get(ORG_COOKIE)?.value;
  const pick = rows.find((r) => r.org_id === wanted) ?? rows[0];
  const org = pick.orgs as unknown as { name: string; slug: string } | null;
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "member");
  return {
    userId: user.id,
    login,
    orgId: pick.org_id,
    orgName: org?.name ?? "Team",
    orgSlug: org?.slug ?? "",
    role: pick.role as Role,
    orgs: rows.map((r) => ({
      id: r.org_id,
      name: (r.orgs as unknown as { name: string } | null)?.name ?? "Team",
      role: r.role as Role,
    })),
  };
});

/** True when `role` is at least `min` (owner > admin > member). */
export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min];
}

/** currentOrg() or null when the caller is below `min`. Server actions use it
 *  as their first line; pages branch on hasRole() to hide controls. */
export async function requireRole(min: Role): Promise<OrgContext | null> {
  const ctx = await currentOrg();
  return ctx && hasRole(ctx.role, min) ? ctx : null;
}

export const ORG_COOKIE_OPTS = { maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, path: "/" };
