import { notFound, redirect } from "next/navigation";
import { loadPrs } from "@/lib/desk/prs";
import { deskScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { PrDetail } from "../detail";
import { PrPane } from "../pane";

// Desk · Pull request detail (Dusk): the same list pane with this PR selected,
// and the reading pane from ../detail.

export const dynamic = "force-dynamic";

export default async function DeskPrDetail({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ repo?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const n = Number(number);
  if (!Number.isFinite(n)) notFound();
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
  const g = groups.find((x) => x.prs.some((p) => p.number === n));
  const pr = g?.prs.find((p) => p.number === n);
  if (!g || !pr) notFound();

  return (
    <>
      <PrPane groups={groups} scopeAll={!scope.repoId} current={n} />
      <PrDetail g={g} pr={pr} />
    </>
  );
}
