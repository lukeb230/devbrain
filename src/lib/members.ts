import { supabaseAdmin } from "@/lib/supabase/server";

// Team member names for assignment dropdowns. Every account on this instance
// is an allowlisted team member, so auth.users IS the roster.
export async function teamMembers(): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin().auth.admin.listUsers({ perPage: 50 });
    const names = (data?.users ?? []).map((u) => {
      const m = (u.user_metadata ?? {}) as Record<string, unknown>;
      return String(m.user_name || m.preferred_username || u.email?.split("@")[0] || "").trim();
    });
    return [...new Set(names.filter(Boolean))].sort();
  } catch {
    return [];
  }
}
