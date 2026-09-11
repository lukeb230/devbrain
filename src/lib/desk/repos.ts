import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/server";

// This team's linked repos, fetched ONCE per request. The Console's layout
// (repo switcher) and the page itself (scope, names) both need them; before
// this they each ran their own query, one after the other. Org-scoped
// explicitly — the caller has already established membership via currentOrg.

export interface TeamRepo {
  id: string;
  full_name: string;
  default_branch: string | null;
  installation_id: number | null;
}

export const teamRepos = cache(async (orgId: string): Promise<TeamRepo[]> => {
  const { data } = await supabaseAdmin()
    .from("linked_repos")
    .select("id, full_name, default_branch, installation_id")
    .eq("org_id", orgId)
    .is("unlinked_at", null)
    .order("created_at");
  return (data ?? []) as TeamRepo[];
});
