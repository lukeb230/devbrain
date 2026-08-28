import { supabaseAdmin } from "@/lib/supabase/server";

// Team member names for assignment dropdowns: the members of ONE org, never
// every account on the instance.
export async function teamMembers(orgId: string): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin().from("org_members").select("github_login").eq("org_id", orgId);
    return [...new Set((data ?? []).map((r) => String(r.github_login || "").trim()).filter(Boolean))].sort();
  } catch {
    return [];
  }
}
