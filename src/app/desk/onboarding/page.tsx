import { redirect } from "next/navigation";
import { teamRepos } from "@/lib/desk/repos";
import { loadOnboarding } from "@/lib/onboarding-load";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { OnboardingWall } from "./wall";

export const dynamic = "force-dynamic";

// The same walkthrough, reachable on purpose: teammates, and owners coming
// back after finishing. The layout above has already handled the wall case.
export default async function OnboardingPage() {
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const repos = await teamRepos(org.orgId);
  const state = await loadOnboarding(org, repos);
  const policies: Record<string, boolean> = {};
  if (repos.length) {
    const { data } = await supabaseAdmin().from("policies").select("repo_id, rule, enabled").in("repo_id", repos.map((r) => r.id));
    for (const p of data ?? []) policies[`${p.repo_id}:${p.rule}`] = Boolean(p.enabled);
  }
  return <OnboardingWall org={org} repos={repos} state={state} appSlug={process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain"} openRequestBy={state.openRequestBy} policies={policies} notice={null} />;
}
