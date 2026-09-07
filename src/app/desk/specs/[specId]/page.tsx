import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createTasksFromItems, deleteSpec, dismissItem, requeueSpec, restoreItem } from "@/app/dashboard/[repoId]/specs/actions";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "../../desk-next";
import { Button, Card, Chip, Empty, PageTitle } from "../../ui";

// ============================================================================
// Desk · Spec detail — the extracted requirements grouped by verdict, each
// with evidence; tick the ones you want on the board → Create tasks. Dismiss
// / restore items, requeue the analysis, delete the spec. Same six actions
// as the dashboard.
// ============================================================================

export const dynamic = "force-dynamic";

const GROUPS: { key: string; label: string; blurb: string; tone: string }[] = [
  { key: "conflict", label: "Conflicts with a decision", blurb: "Contradicts something already decided in the brain or on the board — read before building.", tone: "text-stop" },
  { key: "missing", label: "Not built yet", blurb: "Nothing in the repo, the brain or the board covers this.", tone: "text-muted" },
  { key: "partial", label: "Half-built", blurb: "Some of it exists; the evidence says what.", tone: "text-wait" },
  { key: "done", label: "Already built", blurb: "Covered — the evidence points at where.", tone: "text-go" },
];

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
  const [{ data: spec }, { data: items }] = await Promise.all([
    supabase.from("specs").select("id, repo_id, title, source_name, source_kind, status, error, uploaded_by, created_at, analyzed_at, body").eq("id", specId).single(),
    supabase.from("spec_items").select("id, requirement, detail, verdict, confidence, evidence, suggested_priority, suggested_tags, task_id, dismissed_at").eq("spec_id", specId).order("created_at"),
  ]);
  if (!spec) notFound();
  const repo = (repos ?? []).find((r) => r.id === spec.repo_id);
  if (!repo) notFound();
  const repoScope = scope.repoId === repo.id ? scope : repo.id;
  const list = withScope("/desk/specs", repoScope);
  const live = (items ?? []).filter((i) => !i.dismissed_at);
  const dismissed = (items ?? []).filter((i) => i.dismissed_at);
  const linked = live.filter((i) => i.task_id).length;
  const Hidden = () => (<><DeskNext /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="specId" value={spec.id} /></>);

  return (
    <>
      <Link href={list} className="font-mono text-[10px] text-faint hover:text-brand-400">← specs</Link>
      <PageTitle
        title={spec.title}
        sub={<span className="flex items-center gap-2"><Chip tone="muted">{spec.source_kind}</Chip>{spec.source_name && <span>{spec.source_name}</span>}<span>added by {spec.uploaded_by} · {live.length} requirements{linked ? ` · ${linked} turned into tasks` : ""}</span></span>}
        right={
          <>
            {spec.status === "ready" && <form action={requeueSpec}><Hidden /><Button tone="ghost">Re-analyze</Button></form>}
            <form action={deleteSpec}><input type="hidden" name="next" value={list} /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="specId" value={spec.id} /><Button tone="danger">Delete spec</Button></form>
          </>
        }
      />

      {spec.status !== "ready" && (
        <Card title={spec.status === "failed" ? "Analysis failed" : "Analyzing…"}>
          {spec.status === "failed" ? (
            <>
              <p className="text-[12px] text-stop">{spec.error ?? "The extraction did not complete."}</p>
              <form action={requeueSpec} className="mt-2"><Hidden /><Button tone="ghost">Try again</Button></form>
            </>
          ) : (
            <Empty>The tick picks this up within two minutes and extracts the requirements. This page refreshes when you come back to it.</Empty>
          )}
        </Card>
      )}

      {spec.status === "ready" && live.length === 0 && <Empty>No requirements were found in this document.</Empty>}

      {spec.status === "ready" && live.length > 0 && (
        <form action={createTasksFromItems}>
          <Hidden />
          <div className="mb-2.5 flex items-center gap-3 rounded-xl border border-line bg-row px-3.5 py-2">
            <span className="text-[12px] text-muted">Tick what you want on the board, then</span>
            <span className="flex-1" />
            <Button>Create tasks</Button>
          </div>
          {GROUPS.map((g) => {
            const rows = live.filter((i) => i.verdict === g.key);
            if (rows.length === 0) return null;
            return (
              <Card key={g.key} title={<span className={g.tone}>{g.label}</span>} count={rows.length} right={g.blurb}>
                {rows.map((i) => (
                  <div key={i.id} className="flex items-start gap-2.5 border-t border-line py-2 first:border-t-0">
                    {i.task_id ? (
                      <Link href={`${withScope("/desk/board", repoScope)}&task=${i.task_id}`} className="mt-0.5 font-mono text-[10px] text-brand-400 hover:underline" title="Already a task — open it on the Board">task ↗</Link>
                    ) : (
                      <input type="checkbox" name="item" value={i.id} className="mt-1" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] text-txt">{i.requirement}</div>
                      {i.detail && <div className="mt-0.5 text-[11.5px] text-muted">{i.detail}</div>}
                      {i.evidence && <div className="mt-1 rounded-md border border-line bg-ink px-2 py-1 font-mono text-[10.5px] text-[var(--wg-code)]">{i.evidence}</div>}
                      <div className="mt-1 flex flex-wrap gap-1.5 font-mono text-[10px] text-faint">
                        {typeof i.confidence === "number" && <span>confidence {Math.round(i.confidence * 100)}%</span>}
                        {i.suggested_priority && <span>P{i.suggested_priority}</span>}
                        {((i.suggested_tags as string[]) ?? []).map((t) => <Chip key={t} tone="muted">{t}</Chip>)}
                      </div>
                    </div>
                    {!i.task_id && <button formAction={dismissItem} name="id" value={i.id} className="font-display text-[11px] font-semibold text-faint hover:text-txt" title="Hide this item">dismiss</button>}
                  </div>
                ))}
              </Card>
            );
          })}
        </form>
      )}

      {dismissed.length > 0 && (
        <Card title="Dismissed" count={dismissed.length}>
          {dismissed.map((i) => (
            <div key={i.id} className="flex items-center gap-2 border-t border-line py-1.5 text-[12px] text-faint first:border-t-0">
              <span className="min-w-0 flex-1 truncate line-through">{i.requirement}</span>
              <form action={restoreItem}><Hidden /><input type="hidden" name="id" value={i.id} /><button className="font-display text-[11px] font-semibold text-muted hover:text-txt">restore</button></form>
            </div>
          ))}
        </Card>
      )}
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
