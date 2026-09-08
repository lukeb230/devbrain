import Link from "next/link";
import { redirect } from "next/navigation";
import { assignTask, braindumpTasks, completeTask, confirmMaybeDone, createTask, deleteTask, dismissMaybeDone, reopenTask, startTask, togglePin, updateTask } from "@/app/dashboard/[repoId]/tasks/actions";
import { deskScope, withScope } from "@/lib/desk/scope";
import { pickSuggestedNext } from "@/lib/lanes";
import { teamMembers } from "@/lib/members";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { ListPane, ListRow, PaneEyebrow, Reading } from "../panes";
import { RepoChooser } from "../repo-chooser";
import { ACTION, ACTION_STOP, Banner, Button, Card, Empty, Eyebrow, Field, Kv, Pill, Popover, Select, Textarea } from "../ui";

// ============================================================================
// Desk · Board (Dusk). List pane: Tasks with filter pills and the four
// sections (in progress · open · possibly done · done), "+" for a new task.
// Reading pane = the task drawer: the selected task (?task=), else the
// dispatcher's pick for you, with every action, the edit form, delete, and
// the Braindump card at the bottom. All 11 task actions reused unchanged.
// ============================================================================

export const dynamic = "force-dynamic";
export const maxDuration = 60; // braindump asks Claude to split the dump

const PRESET_TAGS = ["bug", "feature", "ui", "backend", "plugin", "brain", "docs", "refactor"];
const P: Record<number, string> = { 1: "text-stop", 2: "text-wait", 3: "text-muted", 4: "text-faint" };
const PNAME: Record<number, string> = { 1: "critical", 2: "high", 3: "normal", 4: "low" };

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
  if (!scope.repoId) return <RepoChooser repos={repos ?? []} route="/desk/board" what="board" title="Board" />;
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const [{ data: rows }, members, { data: claimRows }] = await Promise.all([
    supabase.from("tasks").select("id, repo_id, title, detail, priority, tags, status, created_by, created_at, done_by, done_at, assigned_to, maybe_done_pr, started_by, footprint, pinned").eq("repo_id", repo.id).order("created_at"),
    teamMembers(org.orgId),
    supabase.from("claims").select("dev_label, paths").eq("repo_id", repo.id).is("released_at", null),
  ]);
  const all = (rows ?? []) as Task[];
  const meta = (user.user_metadata ?? {}) as { user_name?: string; preferred_username?: string };
  const you = String(meta.user_name || meta.preferred_username || user.email?.split("@")[0] || "");
  const othersBusy: string[] = [];
  for (const c of claimRows ?? []) if (c.dev_label?.toLowerCase() !== you.toLowerCase()) othersBusy.push(...(((c.paths as string[]) ?? [])));
  for (const t of all) if (t.status === "open" && t.started_by && t.started_by.toLowerCase() !== you.toLowerCase()) othersBusy.push(...(t.footprint ?? []));
  const suggested = you ? pickSuggestedNext(all.filter((t) => t.status === "open" && !t.maybe_done_pr).map((t) => ({ id: t.id, title: t.title, priority: t.priority, tags: t.tags ?? [], assigned_to: t.assigned_to, started_by: t.started_by, footprint: t.footprint, created_at: t.created_at })), you, othersBusy) : null;
  const who = sp.who && sp.who !== "all" ? sp.who : null;
  const mine = (t: Task) => !who || t.assigned_to === who || t.started_by === who || t.done_by?.startsWith(who);
  const open = all.filter((t) => t.status === "open" && mine(t));
  const inProgress = open.filter((t) => t.started_by).sort(byBoard);
  const todo = open.filter((t) => !t.started_by && !t.maybe_done_pr).sort(byBoard);
  const maybe = open.filter((t) => !t.started_by && t.maybe_done_pr).sort(byBoard);
  const done = all.filter((t) => t.status === "done" && mine(t)).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? "")).slice(0, 15);
  const explicit = sp.task ? all.find((t) => t.id === sp.task) ?? null : null;
  const selected = explicit ?? (suggested ? all.find((t) => t.id === suggested.id) ?? null : null) ?? inProgress[0] ?? todo[0] ?? maybe[0] ?? null;
  const isSuggested = Boolean(selected && suggested && selected.id === suggested.id);
  const base = withScope("/desk/board", scope);
  const here = base + (who ? `&who=${encodeURIComponent(who)}` : "");
  const taskHref = (id: string) => `${here}&task=${id}`;

  const TaskRow = ({ t, dim }: { t: Task; dim?: boolean }) => (
    <ListRow href={taskHref(t.id)} selected={selected?.id === t.id} dim={dim}>
      <div className="flex items-baseline gap-2.5">
        <span className={`font-mono text-[10px] ${dim ? "" : P[t.priority] ?? "text-muted"}`}>{dim ? "✓" : `P${t.priority}`}</span>
        <div className="min-w-0 flex-1">
          <div className={`truncate text-[13px] ${selected?.id === t.id ? "font-medium" : ""}`}>{t.pinned && <span className="text-accent2">⌖ </span>}{t.title}</div>
          <div className={`truncate text-[11px] ${dim ? "" : "text-muted"}`}>
            {dim ? `${t.done_by ?? "?"} · ${t.done_at ? timeAgo(t.done_at) : ""}` : <>{t.started_by ?? t.assigned_to ?? "unassigned"}{(t.tags ?? []).length > 0 && ` · ${(t.tags ?? []).join(", ")}`}{t.maybe_done_pr ? ` · PR #${t.maybe_done_pr}?` : ""}{suggested?.id === t.id ? " · next for you" : ""}</>}
          </div>
        </div>
      </div>
    </ListRow>
  );
  const Hidden = ({ t }: { t: Task }) => (<><DeskNext /><input type="hidden" name="repoId" value={t.repo_id} /><input type="hidden" name="id" value={t.id} /></>);
  const status = (t: Task) => t.status === "done" ? `done · ${t.done_by ?? ""}` : t.started_by ? `in progress · ${t.started_by}` : t.maybe_done_pr ? `possibly done · PR #${t.maybe_done_pr}` : `open${t.pinned ? " · pinned" : ""}`;

  return (
    <>
      <ListPane
        title="Tasks"
        count={`${open.length} open`}
        right={
          <Popover label={<span className="text-[18px] leading-none text-accent2" title="New task">＋</span>} tone="link" width={420} align="right">
            <form action={createTask} className="flex flex-col gap-2">
              <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
              <Field name="title" required placeholder="What the work is" ground="ink" autoFocus />
              <Field name="detail" placeholder="Detail (optional)" ground="ink" />
              <div className="flex gap-2">
                <Select name="priority" defaultValue="3" ground="ink"><option value="1">P1 · critical</option><option value="2">P2 · high</option><option value="3">P3 · normal</option><option value="4">P4 · low</option></Select>
                <Select name="assignee" defaultValue="" ground="ink"><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
              </div>
              <div className="flex flex-wrap gap-2 text-[12px] text-muted">{PRESET_TAGS.map((t) => <label key={t} className="flex items-center gap-1"><input type="checkbox" name="tags" value={t} className="accent-[var(--wg-accent-strong)]" />{t}</label>)}</div>
              <Field name="customTags" placeholder="more tags, comma-separated" ground="ink" />
              <div className="text-right"><Button>Create</Button></div>
            </form>
          </Popover>
        }
      >
        <div className="flex flex-wrap gap-1.5 px-4 pb-2.5 text-[11.5px]">
          <Link href={base} className={`rounded-full px-[9px] py-0.5 ${!who ? "bg-txt text-ink" : "border border-line text-muted hover:text-txt"}`}>everyone</Link>
          {members.map((m) => <Link key={m} href={`${base}&who=${encodeURIComponent(m)}`} className={`rounded-full px-[9px] py-0.5 ${who === m ? "bg-txt text-ink" : "border border-line text-muted hover:text-txt"}`}>{m}</Link>)}
        </div>
        <PaneEyebrow className="pt-2.5">in progress · {inProgress.length}</PaneEyebrow>
        {inProgress.length === 0 && <p className="px-4 pb-1 text-[12px] text-faint">Nothing started.</p>}
        {inProgress.map((t) => <TaskRow key={t.id} t={t} />)}
        <PaneEyebrow>open · {todo.length}</PaneEyebrow>
        {todo.length === 0 && <p className="px-4 pb-1 text-[12px] text-faint">Nothing open.</p>}
        {todo.map((t) => <TaskRow key={t.id} t={t} />)}
        {maybe.length > 0 && (
          <>
            <PaneEyebrow tone="wait">possibly done · {maybe.length}</PaneEyebrow>
            {maybe.map((t) => <TaskRow key={t.id} t={t} />)}
          </>
        )}
        <PaneEyebrow tone="go">done · {done.length}</PaneEyebrow>
        {done.map((t) => <TaskRow key={t.id} t={t} dim />)}
        <div className="pb-3" />
      </ListPane>

      <Reading>
        {!selected ? (
          <Empty>No tasks yet. Add one with ＋, or paste a braindump below.</Empty>
        ) : (
          <>
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <div className={`font-mono text-[11px] uppercase tracking-[.1em] ${isSuggested ? "text-accent2" : "text-faint"}`}>{isSuggested ? `next for you · ${suggested!.footprint && suggested!.footprint.length > 0 ? "lane is free" : "footprint not predicted yet"}` : `task · ${status(selected)}`}</div>
                <h1 className="mt-1.5 font-display text-[32px] font-medium leading-[1.1] tracking-[-.02em] text-txt">{selected.title}</h1>
                {selected.detail && <p className="mt-3 max-w-[560px] whitespace-pre-line text-[14px] leading-[1.65] text-body">{selected.detail}</p>}
              </div>
              <div className="flex flex-shrink-0 gap-2">
                {selected.status === "open" && !selected.started_by && <form action={startTask}><Hidden t={selected} /><Button>Start</Button></form>}
                {selected.status === "open" && <form action={completeTask}><Hidden t={selected} /><Button tone={selected.started_by ? "primary" : "ghost"}>Mark done</Button></form>}
                {selected.status === "done" && <form action={reopenTask}><Hidden t={selected} /><Button tone="ghost">Reopen</Button></form>}
                <form action={togglePin}><Hidden t={selected} /><input type="hidden" name="pinned" value={String(!selected.pinned)} /><Button tone="ghost">{selected.pinned ? "Unpin" : "Pin"}</Button></form>
              </div>
            </div>

            {selected.maybe_done_pr && selected.status === "open" && (
              <Banner tone="wait" className="mt-6" right={<span className="flex gap-3"><form action={confirmMaybeDone}><Hidden t={selected} /><button className="text-[12px] font-semibold text-go hover:underline">Yes, done</button></form><form action={dismissMaybeDone}><Hidden t={selected} /><button className="text-[12px] font-semibold text-faint hover:text-txt">Still open</button></form></span>}>
                PR #{selected.maybe_done_pr} looks like it closed this.
              </Banner>
            )}

            <div className="mt-6 grid grid-cols-[repeat(4,auto)] justify-start gap-8 border-y border-line py-4 text-[13px]">
              <Kv k="priority">P{selected.priority} · {PNAME[selected.priority] ?? "normal"}</Kv>
              <Kv k="status">{status(selected)}</Kv>
              <Kv k="assigned">
                <form action={assignTask} className="flex items-center gap-2"><Hidden t={selected} /><Select name="assignee" defaultValue={selected.assigned_to ?? ""} size="sm"><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select><button className="text-[12px] text-accent hover:underline">set</button></form>
              </Kv>
              <Kv k="created" muted>{selected.created_by ?? "?"} · {timeAgo(selected.created_at)}</Kv>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-7">
              <div>
                <Eyebrow>tags</Eyebrow>
                <div className="mt-2 flex flex-wrap gap-1.5">{(selected.tags ?? []).length === 0 ? <span className="text-[12px] text-faint">none</span> : (selected.tags ?? []).map((t) => <Pill key={t} tone="sans">{t}</Pill>)}</div>
              </div>
              <div>
                <Eyebrow>lane · predicted footprint</Eyebrow>
                <div className="mt-2 font-mono text-[12px] leading-[1.8] text-body">{(selected.footprint ?? []).length === 0 ? <span className="text-faint">not predicted yet — the tick fills it in</span> : (selected.footprint ?? []).map((f) => <div key={f}>{f}</div>)}</div>
              </div>
            </div>

            <details className="mt-8 border-t border-line pt-4">
              <summary className="cursor-pointer list-none font-display text-[17px] font-medium text-txt">Edit task</summary>
              <form action={updateTask} className="mt-3 grid max-w-[640px] grid-cols-2 gap-2.5">
                <Hidden t={selected} />
                <Field name="title" required defaultValue={selected.title} className="col-span-2" />
                <Field name="detail" defaultValue={selected.detail ?? ""} placeholder="Detail" className="col-span-2" />
                <Select name="priority" defaultValue={String(selected.priority)}><option value="1">P1 · critical</option><option value="2">P2 · high</option><option value="3">P3 · normal</option><option value="4">P4 · low</option></Select>
                <Select name="assignee" defaultValue={selected.assigned_to ?? ""}><option value="">unassigned</option>{members.map((m) => <option key={m} value={m}>{m}</option>)}</Select>
                <Field name="tags" defaultValue={(selected.tags ?? []).join(", ")} placeholder="tags, comma-separated" className="col-span-2" />
                <div className="col-span-2 text-right"><Button>Save</Button></div>
              </form>
            </details>
            <form action={deleteTask} className="mt-5 flex items-center gap-3 text-[12.5px] text-muted">
              <input type="hidden" name="next" value={here} /><input type="hidden" name="repoId" value={selected.repo_id} /><input type="hidden" name="id" value={selected.id} />
              <span>Removes the task and releases its lane.</span><button className={ACTION_STOP}>Delete task</button>
            </form>
          </>
        )}

        <Card pad="md" className="mt-10">
          <form action={braindumpTasks}>
            <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
            <div className="flex items-baseline gap-2"><span className="font-display text-[17px] font-medium text-txt">Braindump</span><span className="text-[12px] text-faint">· uses one AI call · duplicates are skipped</span></div>
            <Textarea name="dump" required rows={3} placeholder="Paste or type freely — one task per line, or a paragraph. Claude splits it into tasks with priorities and tags." className="mt-2.5 h-[72px]" />
            <div className="mt-2 text-right"><Button tone="ghost">Split into tasks</Button></div>
          </form>
        </Card>
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
        {explicit && suggested && explicit.id !== suggested.id && <Link href={here} className={`mt-4 inline-block ${ACTION}`}>← back to the pick for you</Link>}
      </Reading>
    </>
  );
}
