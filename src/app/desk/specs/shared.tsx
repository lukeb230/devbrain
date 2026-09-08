import Link from "next/link";
import { createTasksFromItems, deleteSpec, dismissItem, requeueSpec, restoreItem, uploadSpec } from "@/app/dashboard/[repoId]/specs/actions";
import { SpecDropzone } from "@/app/dashboard/[repoId]/specs/dropzone";
import { withScope } from "@/lib/desk/scope";
import { DeskNext } from "../desk-next";
import { ListPane, ListRow, Reading } from "../panes";
import { ACTION_MUTED, Button, Empty, Section } from "../ui";

// ============================================================================
// Specs (Dusk): the list pane (drop target + one row per spec with counts)
// and the spec reading pane (requirements grouped by verdict, tick → Create
// tasks, dismiss / restore, re-analyze, delete). Shared by /specs and
// /specs/<id>. The upload goes through a bound action that adds the Desk's
// return path (the dropzone can't carry <DeskNext/> itself).
// ============================================================================

export type SpecRow = { id: string; title: string; source_name: string | null; source_kind: string; status: string; error: string | null; uploaded_by: string; created_at: string; analyzed_at: string | null };
export type ItemRow = { id: string; spec_id?: string; requirement: string; detail: string | null; verdict: string; confidence: number | null; evidence: string | null; suggested_priority: number | null; suggested_tags: string[] | null; task_id: string | null; dismissed_at: string | null };

const VTEXT: Record<string, string> = { done: "text-go", partial: "text-wait", missing: "text-muted", conflict: "text-stop" };
const STATUS_TEXT = (s: string) => (s === "ready" ? "text-muted" : s === "failed" ? "text-stop" : "text-wait");
const GROUPS: { key: string; label: string; blurb: string; tone?: "go" | "wait" | "stop"; edge: string }[] = [
  { key: "conflict", label: "Conflicts with a decision", blurb: "Contradicts something already decided — read before building.", tone: "stop", edge: "border-l-stop" },
  { key: "missing", label: "Not built yet", blurb: "Nothing in the repo, the brain or the board covers this.", edge: "border-l-line2" },
  { key: "partial", label: "Half-built", blurb: "Some of it exists; the evidence says what.", tone: "wait", edge: "border-l-wait" },
  { key: "done", label: "Already built", blurb: "Covered — the evidence points at where.", tone: "go", edge: "border-l-go" },
];

export function SpecPane({ repo, specs, items, scope, current, here }: { repo: { id: string; full_name: string }; specs: SpecRow[]; items: { spec_id: string; verdict: string; dismissed_at: string | null; task_id: string | null }[]; scope: Parameters<typeof withScope>[1]; current: string | null; here: string }) {
  async function uploadFromDesk(fd: FormData) {
    "use server";
    fd.set("next", here);
    return uploadSpec(fd);
  }
  const countsFor = (specId: string) => {
    const mine = items.filter((i) => i.spec_id === specId && !i.dismissed_at);
    const by: Record<string, number> = { done: 0, partial: 0, missing: 0, conflict: 0 };
    for (const i of mine) by[i.verdict] = (by[i.verdict] ?? 0) + 1;
    return by;
  };
  return (
    <ListPane title="Specs" count={specs.length}>
      <SpecDropzone repoId={repo.id} action={uploadFromDesk} />
      {specs.length === 0 && <p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">No context docs yet.</p>}
      {specs.map((s) => {
        const by = countsFor(s.id);
        return (
          <ListRow key={s.id} href={withScope(`/desk/specs/${s.id}`, scope)} selected={current === s.id} pad="10px">
            <div className={`text-[13px] ${current === s.id ? "font-medium" : ""}`}>{s.title}</div>
            <div className="mt-[3px] font-mono text-[10.5px] text-muted">{s.source_kind} · {s.uploaded_by} · {new Date(s.created_at).toLocaleDateString(undefined, { month: "numeric", day: "numeric" })} · <span className={STATUS_TEXT(s.status)}>{s.status}</span></div>
            {s.status === "ready" && (
              <div className="mt-1 flex gap-2 font-mono text-[10.5px]">
                {Object.entries(by).filter(([, n]) => n > 0).map(([k, n]) => <span key={k} className={VTEXT[k]}>{n} {k}</span>)}
              </div>
            )}
          </ListRow>
        );
      })}
      <div className="pb-3" />
    </ListPane>
  );
}

export function SpecDetail({ repo, spec, items, scope, list, error }: { repo: { id: string; full_name: string }; spec: SpecRow; items: ItemRow[]; scope: Parameters<typeof withScope>[1]; list: string; error?: string }) {
  const live = items.filter((i) => !i.dismissed_at);
  const dismissed = items.filter((i) => i.dismissed_at);
  const linked = live.filter((i) => i.task_id).length;
  const by: Record<string, number> = { done: 0, partial: 0, missing: 0, conflict: 0 };
  for (const i of live) by[i.verdict] = (by[i.verdict] ?? 0) + 1;
  const Hidden = () => (<><DeskNext /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="specId" value={spec.id} /></>);

  return (
    <Reading>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[11px] uppercase tracking-[.1em] text-faint">{spec.source_kind}{spec.source_name ? ` · ${spec.source_name}` : ""} · added by {spec.uploaded_by} · <span className={STATUS_TEXT(spec.status)}>{spec.status}</span></div>
          <h1 className="mt-1.5 font-display text-[32px] font-medium leading-[1.1] tracking-[-.02em] text-txt">{spec.title}</h1>
          {spec.status === "ready" && (
            <p className="mt-2.5 text-[13px] text-muted">
              {live.length} requirements{linked ? ` · ${linked} turned into tasks` : ""}
              {by.done > 0 && <> · <span className="text-go">{by.done} done</span></>}
              {by.partial > 0 && <> · <span className="text-wait">{by.partial} partial</span></>}
              {by.missing > 0 && <> · {by.missing} missing</>}
              {by.conflict > 0 && <> · <span className="text-stop">{by.conflict} conflict{by.conflict === 1 ? "" : "s"}</span></>}
            </p>
          )}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          {spec.status === "ready" && <form action={requeueSpec}><Hidden /><Button tone="ghost">Re-analyze</Button></form>}
          <form action={deleteSpec}><input type="hidden" name="next" value={list} /><input type="hidden" name="repoId" value={repo.id} /><input type="hidden" name="specId" value={spec.id} /><Button tone="danger">Delete spec</Button></form>
        </div>
      </div>

      {spec.status !== "ready" && (
        <div className="mt-6">
          {spec.status === "failed" ? (
            <>
              <p className="text-[13px] text-stop">{spec.error ?? "The extraction did not complete."}</p>
              <form action={requeueSpec} className="mt-2.5"><Hidden /><Button tone="ghost">Try again</Button></form>
            </>
          ) : (
            <Empty>The tick picks this up within two minutes and extracts the requirements. This page refreshes when you come back to it.</Empty>
          )}
        </div>
      )}

      {spec.status === "ready" && live.length === 0 && <Empty className="mt-6">No requirements were found in this document.</Empty>}

      {spec.status === "ready" && live.length > 0 && (
        <form action={createTasksFromItems}>
          <Hidden />
          <div className="mt-6 flex items-center gap-3 rounded-[10px] bg-coralink px-3.5 py-2.5 text-[13px] text-accent">
            <span className="flex-1">Tick what you want on the board, then</span>
            <Button>Create tasks</Button>
          </div>
          {GROUPS.map((g) => {
            const rows = live.filter((i) => i.verdict === g.key);
            if (rows.length === 0) return null;
            return (
              <Section key={g.key} title={g.label} count={rows.length} tone={g.tone} sub={g.blurb}>
                <div className="mt-2.5">
                  {rows.map((i) => (
                    <div key={i.id} className="grid grid-cols-[20px_1fr_auto] gap-3.5 border-t border-line py-3">
                      {i.task_id ? (
                        <Link href={`${withScope("/desk/board", scope)}&task=${i.task_id}`} className="pt-1 font-mono text-[10px] text-accent hover:underline" title="Already a task — open it on the Board">task↗</Link>
                      ) : (
                        <input type="checkbox" name="item" value={i.id} className="mt-[3px] accent-[var(--wg-accent-strong)]" />
                      )}
                      <div className="min-w-0">
                        <div className="text-[14px] text-txt">{i.requirement}</div>
                        {i.detail && <div className="mt-[3px] text-[12.5px] text-muted">{i.detail}</div>}
                        {i.evidence && <blockquote className={`mt-2 border-l-2 px-3 py-1 font-display text-[14px] italic text-body ${g.edge}`}>{i.evidence}</blockquote>}
                        <div className="mt-1.5 font-mono text-[10.5px] text-faint">
                          {typeof i.confidence === "number" && `confidence ${Math.round(i.confidence * 100)}%`}
                          {i.suggested_priority && ` · P${i.suggested_priority}`}
                          {((i.suggested_tags as string[]) ?? []).length > 0 && ` · ${((i.suggested_tags as string[]) ?? []).join(", ")}`}
                          {i.task_id && " · already on the board"}
                        </div>
                      </div>
                      {!i.task_id ? <button formAction={dismissItem} name="id" value={i.id} className={`self-start ${ACTION_MUTED}`} title="Hide this item">dismiss</button> : <span />}
                    </div>
                  ))}
                </div>
              </Section>
            );
          })}
        </form>
      )}

      {dismissed.length > 0 && (
        <section className="mt-7 border-t border-line pt-3.5 text-[13px] text-faint">
          <span className="font-mono text-[10px] uppercase tracking-[.1em]">dismissed · {dismissed.length}</span>
          {dismissed.map((i) => (
            <span key={i.id} className="ml-3 inline-flex items-center gap-2">
              <span className="line-through">{i.requirement}</span>
              <form action={restoreItem} className="inline"><Hidden /><input type="hidden" name="id" value={i.id} /><button className="text-[12px] text-accent hover:underline">restore</button></form>
            </span>
          ))}
        </section>
      )}
      {error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({error}).</p>}
    </Reading>
  );
}
