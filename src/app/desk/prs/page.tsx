import { redirect } from "next/navigation";
import { loadPrs } from "@/lib/desk/prs";
import { deskScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { Reading } from "../panes";
import { Empty, H1 } from "../ui";
import { PrPane } from "./pane";
import { PrDetail } from "./detail";

// ============================================================================
// Desk · Pull requests (Dusk). List pane: merge order + one row per PR.
// Reading pane: the first PR in merge order (a selection is /prs/<n>).
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskPrs({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repoRows } = await supabase.from("linked_repos").select("id").eq("org_id", org.orgId).is("unlinked_at", null);
  const scope = await deskScope(sp, (repoRows ?? []).map((r) => r.id));
  const groups = await loadPrs(supabase, org.orgId, scope.repoId);
  const g = groups.find((x) => x.prs.length > 0) ?? null;
  const first = g ? (g.plan?.order[0] ? g.prs.find((p) => p.number === g.plan!.order[0].number) ?? g.prs[0] : g.prs[0]) : null;

  return (
    <>
      <PrPane groups={groups} scopeAll={!scope.repoId} current={first?.number ?? null} />
      {g && first ? (
        <PrDetail g={g} pr={first} />
      ) : (
        <Reading>
          <H1 title="Pull requests" sub={`${scope.repoId ? groups[0]?.full_name ?? "" : "all repos"} · lights are deterministic and every light says why`} />
          <Empty className="mt-6">No open pull requests.</Empty>
        </Reading>
      )}
    </>
  );
}
