import { redirect } from "next/navigation";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { Reading } from "../panes";
import { RepoChooser } from "../repo-chooser";
import { Empty, H1 } from "../ui";
import { SpecDetail, SpecPane, type ItemRow, type SpecRow } from "./shared";

// ============================================================================
// Desk · Specs (Dusk) — the list pane with the drop target; the reading pane
// shows the newest spec (a selection is /specs/<id>).
// ============================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60; // extraction calls Claude

export default async function DeskSpecs({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) return <RepoChooser repos={repos ?? []} route="/desk/specs" what="specs" title="Specs" />;
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const here = withScope("/desk/specs", scope);

  const [{ data: specs }, { data: items }] = await Promise.all([
    supabase.from("specs").select("id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at").eq("repo_id", repo.id).order("created_at", { ascending: false }),
    supabase.from("spec_items").select("id, spec_id, requirement, detail, verdict, confidence, evidence, suggested_priority, suggested_tags, task_id, dismissed_at").eq("repo_id", repo.id).order("created_at"),
  ]);
  const list = (specs ?? []) as SpecRow[];
  const newest = list[0] ?? null;

  return (
    <>
      <SpecPane repo={repo} specs={list} items={(items ?? []) as (ItemRow & { spec_id: string })[]} scope={scope} current={newest?.id ?? null} here={here} />
      {newest ? (
        <SpecDetail repo={repo} spec={newest} items={((items ?? []) as (ItemRow & { spec_id: string })[]).filter((i) => i.spec_id === newest.id)} scope={scope} list={here} error={sp.error} />
      ) : (
        <Reading>
          <H1 title="Specs" sub={`${repo.full_name} · drop anything that describes where this app is going; DevBrain shows what's built, half-built, missing, or contradicts a decision you already made`} />
          <Empty className="mt-6">No context docs yet. Drop one in the list on the left.</Empty>
          {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
        </Reading>
      )}
    </>
  );
}
