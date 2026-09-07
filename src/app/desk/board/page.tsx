import Link from "next/link";
import { redirect } from "next/navigation";
import { assignTask, braindumpTasks, completeTask, confirmMaybeDone, createTask, deleteTask, dismissMaybeDone, reopenTask, startTask, togglePin, updateTask } from "@/app/dashboard/[repoId]/tasks/actions";
import { deskScope, withScope } from "@/lib/desk/scope";
import { teamMembers } from "@/lib/members";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { RepoChooser } from "../repo-chooser";
import { Button, Card, Chip, Empty, Field, PageTitle, Select } from "../ui";

// ============================================================================
// Desk · Board — every task and lane for one repo. Three columns, a filter by
// person, pinned first; the selected task (?task=<id>) opens a right-hand
// drawer with everything the dashboard's board could do: start, mark done,
// reopen, pin, assign, edit, delete, confirm / dismiss possibly-done. New
// task and Braindump are disclosure forms. All 11 task actions reused.
// ============================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60; // braindump asks Claude to split the dump

const PRESET_TAGS = ["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"];
const P: Record<number, string> = { 1: "text-stop", 2: "text-wait", 3: "text-muted", 4: "text-faint" };
const act = "font-display text-[11.5px] font-semibold text-brand-400 hover:underline";

type Task = {
  id: string; repo_id: string; title: string; detail: string | null; priority: number; tags: string[] | null; status: string;
  created_by: string | null; created_at: string; done_by: string | null; done_at: string | null; assigned_to: string | null;
  maybe_done_pr: number | null; started_by: string | null; footprint: string[] | null; pinned: boolean | null;
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
const byBoard = (a: Task, b: Task) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.priority - b.priority || a.created_at.localeCompare(b.created_at);

export default async function DeskBoard({ searchParams }: { searchParams: Promise<{ repo?: string; task?: string; who?: string; error?: string }> }) {
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
  if (!scope.repoId) {
    return (
      <>
        <PageTitle title="Board" sub="Every task and lane, for one repo." />
        <RepoChooser repos={repos ?? []} route="/desk/board" what="board" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const [{ data: rows }, members] = await Promise.all([
    supabase.from("tasks").select("id, repo_id, title, detail, priority, tags, status, created_by, created_at, done_by, done_at, assigned_to, maybe_done_pr, started_by, footprint, pinned").eq("repo_id", repo.id).order("created_at"),
    teamMembers(org.orgId),
  ]);
  const all = (rows ?? []) as Task[];
  const who = sp.who && sp.who !== "all" ? sp.who : null;
  const mine = (t: Task) => !who || t.assigned_to === who || t.started_by === who || t.done_by?.startsWith(who);
  const open = all.filter((t) => t.status === "open" && mine(t));
  const inProgress = open.filter((t) => t.started_by).sort(byBoard);
  const todo = open.filter((t) => !t.started_by && !t.maybe_done_pr).sort(byBoard);
  const maybe = open.filter((t) => !t.started_by && t.maybe_done_pr).sort(byBoard);
  const done = all.filter((t) => t.status === "done" && mine(t)).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")).slice(0, 15);
  const selected = sp.task ? all.find((t) => t.id === sp.task) ?? null : null;
  const here = withScope("/desk/board", scope) + (who ? `&who=${encodeURIComponent(who)}` : "");
  const taskHref = (id: string) => `${here}&task=${id}`;

  const CardRow = ({ t }: { t: Task }) => (
    <Link href={taskHref(t.id)} className={"block rounded-lg border px-2.5 py-2 hover:border-brand-500 " + (selected?.id === t.id ? "border-brand-500 bg-ink" : "border-line2 bg-ink")}>
      <div className="truncate text-[12.5px] text-txt">{t.pinned ? <span className="mr-1 text-brand-400">⌖</span> : null}{t.title}</div>
      <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-muted">
        <span className={P[t.priority] ?? "text-muted"}>P{t.priority}</span>
        <span className="truncate">{t.started_by ?? t.assigned_to ?? "unassigned"}</span>
        {t.maybe_done_pr ? <span className="text-wait">· PR #{t.maybe_done_pr}?</span> : null}
        {(t.tags ?? []).length > 0 && <span className="truncate text-faint">· {(t.tags ?? []).join(", ")}</span>}
      </div>
    </Link>
  );
  const Col = ({ title, n, items, empty }: { title: string; n: number; items: Task[]; empty: string }) => (
    <Card title={title} count={n} className="min-h-[200px]">
      {items.length === 0 ? <Empty>{empty}</Empty> : <div className="flex flex-col gap-1.5">{items.map((t) => <CardRow key={t.id} t={t} />)}</div>}
    </Card>
  );
  const Hidden = ({ t }: { t: Task }) => (<><DeskNext /><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /></>);

  return (
    <div className={selected ? "grid grid-cols-[1fr_360px] gap-3" : ""}>
      <div className="min-w-0">
        <PageTitle
          title="Board"
          sub={<>{repo.full_name} · {open.length} open · <Link href={withScope("/desk/board", scope)} className={!who ? "text-txt" : "hover:text-txt"}>everyone</Link>{members.map((m) => <Link key={m} href={`${withScope("/desk/board", scope)}&who=${encodeURIComponent(m)}`} className={"ml-2 " + (who === m ? "text-txt" : "hover:text-txt")}>{m}</Link>)}</>}
          right={
            <>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg bg-brand-600 px-3 py-1.5 font-display text-[11.5px] font-semibold text-white hover:bg-brand-700">＋ New task</summary>
                <form action={createTask} className="absolute right-0 z-10 mt-1 flex w-[420px] flex-col gap-1.5 rounded-xl border border-line2 bg-row p-3 shadow-[var(--wg-shadow)]">
                  <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
                  <Field name="title" required placeholder="What the work is" />
                  <Field name="detail" placeholder="Detail (optional)" />
                  <div className="flex gap-1.5">
                    <Select name="priority" defaultValue="3"><option value="1">P1 · critical</option><option value="2">P2 · high</option><option value="3">P3 · normal</option><option value="4">P4 · low</option></Select>
                    <Select name="assignee" defaultValue=""><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
                  </div>
                  <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">{PRESET_TAGS.map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="tags" value={t} />{t}</label>)}</div>
                  <Field name="customTags" placeholder="more tags, comma-separated" />
                  <div className="text-right"><Button>Create</Button></div>
                </form>
              </details>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-line2 px-3 py-1.5 font-display text-[11.5px] font-semibold text-muted hover:text-txt">Braindump</summary>
                <form action={braindumpTasks} className="absolute right-0 z-10 mt-1 flex w-[460px] flex-col gap-1.5 rounded-xl border border-line2 bg-row p-3 shadow-[var(--wg-shadow)]">
                  <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
                  <textarea name="dump" required rows={7} placeholder="Paste or type freely — one task per line, or a paragraph. Claude splits it into tasks with priorities and tags." className="w-full rounded-lg border border-line2 bg-ink px-2.5 py-1.5 font-mono text-[11.5px] text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
                  <div className="flex items-center justify-between"><span className="text-[10.5px] text-faint">takes a few seconds · uses one AI call</span><Button>Split into tasks</Button></div>
                </form>
              </details>
            </>
          }
        />
        <div className="grid grid-cols-3 gap-2.5">
          <Col title="In progress" n={inProgress.length} items={inProgress} empty="Nothing started." />
          <Col title="Open" n={todo.length} items={todo} empty="Nothing open." />
          <div>
            {maybe.length > 0 && <Col title="Possibly done" n={maybe.length} items={maybe} empty="" />}
            <Col title="Done" n={done.length} items={done} empty="Nothing done yet." />
          </div>
        </div>
        {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </div>

      {selected && (
        <aside className="sticky top-0 self-start rounded-xl border border-line bg-row px-4 py-3">
          <div className="mb-2 flex items-start gap-2">
            <h2 className="min-w-0 flex-1 font-display text-[15px] font-semibold leading-snug">{selected.title}</h2>
            <Link href={here} className="font-mono text-[10px] text-faint hover:text-txt">close</Link>
          </div>
          {selected.detail && <p className="mb-2 whitespace-pre-line text-[12px] text-muted">{selected.detail}</p>}
          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
            <span className="font-mono text-[10.5px] text-faint">priority</span><span className={P[selected.priority]}>P{selected.priority}</span>
            <span className="font-mono text-[10.5px] text-faint">status</span><span>{selected.status === "done" ? `done · ${selected.done_by ?? ""}` : selected.started_by ? `in progress · ${selected.started_by}` : selected.maybe_done_pr ? `possibly done · PR #${selected.maybe_done_pr}` : "open"}</span>
            <span className="font-mono text-[10.5px] text-faint">assigned</span>
            <form action={assignTask} className="flex items-center gap-1.5"><Hidden t={selected} /><Select name="assignee" defaultValue={selected.assigned_to ?? ""}><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select><button className={act}>set</button></form>
            <span className="font-mono text-[10.5px] text-faint">created</span><span className="text-muted">{selected.created_by ?? "?"} · {timeAgo(selected.created_at)}</span>
            {(selected.tags ?? []).length > 0 && <><span className="font-mono text-[10.5px] text-faint">tags</span><span>{(selected.tags ?? []).map((t) => <Chip key={t} tone="muted">{t}</Chip>)}</span></>}
            {(selected.footprint ?? []).length > 0 && <><span className="font-mono text-[10.5px] text-faint">lane</span><span className="flex flex-wrap gap-1">{(selected.footprint ?? []).map((f) => <Chip key={f}>{f}</Chip>)}</span></>}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {selected.status === "open" && !selected.started_by && <form action={startTask}><Hidden t={selected} /><Button>Start</Button></form>}
            {selected.status === "open" && <form action={completeTask}><Hidden t={selected} /><Button tone={selected.started_by ? "primary" : "ghost"}>Mark done</Button></form>}
            {selected.status === "done" && <form action={reopenTask}><Hidden t={selected} /><Button tone="ghost">Reopen</Button></form>}
            <form action={togglePin}><Hidden t={selected} /><input type="hidden" name="pinned" value={String(!selected.pinned)} /><Button tone="ghost">{selected.pinned ? "Unpin" : "Pin"}</Button></form>
          </div>
          {selected.maybe_done_pr && selected.status === "open" && (
            <div className="mt-3 rounded-lg border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3 py-2 text-[12px]">
              <div className="text-wait">PR #{selected.maybe_done_pr} looks like it closed this.</div>
              <div className="mt-1.5 flex gap-2">
                <form action={confirmMaybeDone}><Hidden t={selected} /><button className={act}>Yes, done</button></form>
                <form action={dismissMaybeDone}><Hidden t={selected} /><button className="font-display text-[11.5px] font-semibold text-muted hover:underline">Still open</button></form>
              </div>
            </div>
          )}

          <details className="mt-3">
            <summary className="cursor-pointer list-none font-display text-[10px] uppercase tracking-[.14em] text-muted hover:text-txt">Edit</summary>
            <form action={updateTask} className="mt-2 flex flex-col gap-1.5">
              <Hidden t={selected} />
              <Field name="title" required defaultValue={selected.title} />
              <Field name="detail" defaultValue={selected.detail ?? ""} placeholder="Detail" />
              <div className="flex gap-1.5">
                <Select name="priority" defaultValue={String(selected.priority)}><option value="1">P1</option><option value="2">P2</option><option value="3">P3</option><option value="4">P4</option></Select>
                <Select name="assignee" defaultValue={selected.assigned_to ?? ""}><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
              </div>
              <Field name="tags" defaultValue={(selected.tags ?? []).join(", ")} placeholder="tags, comma-separated" />
              <div className="text-right"><Button>Save</Button></div>
            </form>
          </details>
          <details className="mt-3">
            <summary className="cursor-pointer list-none font-display text-[10px] uppercase tracking-[.14em] text-stop/80 hover:text-stop">Delete</summary>
            <form action={deleteTask} className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-muted">
              {/* explicit next: the deleted task must not stay selected */}<input type="hidden" name="next" value={here} /><input type="hidden" name="repoId" value={selected.repo_id} /><input type="hidden" name="id" value={selected.id} />
              <span>Removes the task and releases its lane.</span><Button tone="danger">Delete task</Button>
            </form>
          </details>
        </aside>
      )}
    </div>
  );
}
