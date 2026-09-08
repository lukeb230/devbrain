import { notFound, redirect } from "next/navigation";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { SpecDetail, SpecPane, type ItemRow, type SpecRow } from "../shared";

// Desk · Spec detail (Dusk): the same list pane with this spec selected, and
// the reading pane from ../shared.

export const dynamic = "force-dynamic";

export default async function DeskSpecDetail({ params, searchParams }: { params: Promise<{ specId: string }>; searchParams: Promise<{ repo?: string; error?: string }> }) {
  const { specId } = await params;
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name").eq("org_id", org.orgId).is("unlinked_at", null);
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  const { data: spec } = await supabase.from("specs").select("id, repo_id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at").eq("id", specId).single();
  if (!spec) notFound();
  const repo = (repos ?? []).find((r) => r.id === spec.repo_id);
  if (!repo) notFound();
  const repoScope = scope.repoId === repo.id ? scope : repo.id;
  const list = withScope("/desk/specs", repoScope);
  const [{ data: specs }, { data: items }] = await Promise.all([
    supabase.from("specs").select("id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at").eq("repo_id", repo.id).order("created_at", { ascending: false }),
    supabase.from("spec_items").select("id, spec_id, requirement, detail, verdict, confidence, evidence, suggested_priority, suggested_tags, task_id, dismissed_at").eq("repo_id", repo.id).order("created_at"),
  ]);
  const all = (items ?? []) as (ItemRow & { spec_id: string })[];

  return (
    <>
      <SpecPane repo={repo} specs={(specs ?? []) as SpecRow[]} items={all} scope={repoScope} current={spec.id} here={withScope(`/desk/specs/${spec.id}`, repoScope)} />
      <SpecDetail repo={repo} spec={spec as SpecRow} items={all.filter((i) => i.spec_id === spec.id)} scope={repoScope} list={list} error={sp.error} />
    </>
  );
}
