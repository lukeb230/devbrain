import Link from "next/link";
import { redirect } from "next/navigation";
import { deskScope, withScope } from "@/lib/desk/scope";
import { formatHit, type MemoryHit } from "@/lib/memory";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { ListPane, Reading } from "../panes";
import { Empty, Section } from "../ui";

// ============================================================================
// Desk · Feed & memory (Dusk). List pane: the memory search and the kind
// filters with counts. Reading pane: one chronological list — time column,
// kind eyebrow in its colour, the line in display type; journals expanded
// with learned / decided / failed / remaining; standups inline. Search needs
// one repo (memory is indexed per repo). Read-only.
// ============================================================================

export const dynamic = "force-dynamic";

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
type Item =
  | { kind: "decision" | "broadcast" | "bot"; at: string; text: string; by: string; repo: string; id: string }
  | { kind: "journal"; at: string; by: string; branch: string | null; summary: string; learned: string[]; decided: string[]; failed: string[]; remaining: string | null; repo: string; id: string }
  | { kind: "handoff"; at: string; by: string; branch: string | null; summary: string; remaining: string | null; open: boolean; repo: string; id: string }
  | { kind: "standup"; at: string; day: string; body: string; repo: string; id: string };

const KIND_TEXT: Record<string, string> = { decision: "text-violet", journal: "text-accent2", broadcast: "text-wait", handoff: "text-wait", standup: "text-txt", bot: "text-faint" };
const FILTERS: { key: string; label: string; kinds: Item["kind"][] }[] = [
  { key: "all", label: "Everything", kinds: ["decision", "broadcast", "journal", "standup", "handoff", "bot"] },
  { key: "decisions", label: "Decisions & broadcasts", kinds: ["decision", "broadcast"] },
  { key: "journals", label: "Session journals", kinds: ["journal"] },
  { key: "standups", label: "Standups", kinds: ["standup"] },
  { key: "handoffs", label: "Handoffs", kinds: ["handoff"] },
  { key: "bot", label: "Bot writes", kinds: ["bot"] },
];

export default async function DeskFeed({ searchParams }: { searchParams: Promise<{ repo?: string; q?: string; kind?: string }> }) {
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
  const ids = scope.repoId ? [scope.repoId] : (repos ?? []).map((r) => r.id);
  const short = (id: string) => (repos ?? []).find((r) => r.id === id)?.full_name.split("/")[1] ?? "?";
  const q = (sp.q ?? "").trim().slice(0, 300);
  const filter = FILTERS.find((f) => f.key === sp.kind) ?? FILTERS[0];
  const base = withScope("/desk/feed", scope);

  const [{ data: events }, { data: journals }, { data: digests }, { data: handoffs }] = await Promise.all([
    supabase.from("events").select("id, kind, payload, at, repo_id").in("repo_id", ids).in("kind", ["decision", "broadcast", "bot_write"]).order("at", { ascending: false }).limit(60),
    supabase.from("journals").select("id, repo_id, dev_label, branch, summary, learned, decisions, tried_and_failed, remaining, at").in("repo_id", ids).order("at", { ascending: false }).limit(20),
    supabase.from("digests").select("day, body, repo_id").in("repo_id", ids).order("day", { ascending: false }).limit(14),
    supabase.from("handoffs").select("id, repo_id, dev_label, branch, summary, remaining, picked_up_at, created_at").in("repo_id", ids).order("created_at", { ascending: false }).limit(20),
  ]);
  const items: Item[] = [];
  for (const e of events ?? []) {
    const p = (e.payload ?? {}) as { text?: string; by?: string; action?: string };
    items.push({ kind: e.kind === "bot_write" ? "bot" : (e.kind as "decision" | "broadcast"), at: e.at, text: p.text ?? p.action ?? "", by: p.by ?? "DevBrain", repo: short(e.repo_id), id: e.id });
  }
  for (const j of journals ?? []) items.push({ kind: "journal", at: j.at, by: j.dev_label, branch: j.branch, summary: j.summary, learned: (j.learned as string[]) ?? [], decided: (j.decisions as string[]) ?? [], failed: (j.tried_and_failed as string[]) ?? [], remaining: j.remaining, repo: short(j.repo_id), id: j.id });
  for (const h of handoffs ?? []) items.push({ kind: "handoff", at: h.created_at, by: h.dev_label, branch: h.branch, summary: h.summary, remaining: h.remaining, open: !h.picked_up_at, repo: short(h.repo_id), id: h.id });
  for (const d of digests ?? []) items.push({ kind: "standup", at: `${d.day}T23:59:59Z`, day: d.day, body: d.body, repo: short(d.repo_id), id: `${d.repo_id}-${d.day}` });
  items.sort((a, b) => b.at.localeCompare(a.at));
  const count = (kinds: Item["kind"][]) => items.filter((i) => kinds.includes(i.kind)).length;
  const shown = items.filter((i) => filter.kinds.includes(i.kind));

  let hits: ReturnType<typeof formatHit>[] = [];
  let mode: "strict" | "any" | null = null;
  if (q && scope.repoId) {
    const admin = supabaseAdmin();
    mode = "strict";
    let { data } = await admin.rpc("memory_search", { p_repo: scope.repoId, p_q: q, p_limit: 12, p_mode: mode });
    if ((data ?? []).length === 0) { mode = "any"; ({ data } = await admin.rpc("memory_search", { p_repo: scope.repoId, p_q: q, p_limit: 12, p_mode: mode })); }
    hits = ((data ?? []) as MemoryHit[]).map(formatHit);
  }
  const Eyebrow = ({ kind, children }: { kind: string; children: React.ReactNode }) => <span className={`mr-2 font-mono text-[10px] uppercase tracking-[.1em] ${KIND_TEXT[kind] ?? "text-faint"}`}>{children}</span>;

  return (
    <>
      <ListPane title="Feed & memory">
        <form method="get" className="mx-4 mb-3">
          {scope.repoId && <input type="hidden" name="repo" value={scope.repoId} />}
          {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
          <div className="flex items-center gap-2 rounded-lg border border-line bg-row px-2.5 py-[7px] text-[12.5px] text-faint">
            <span>⌕</span>
            <input name="q" defaultValue={q} placeholder={scope.repoId ? "has anyone dealt with…" : "pick one repo to search"} disabled={!scope.repoId} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-faint focus:outline-none" />
          </div>
        </form>
        {FILTERS.map((f) => (
          <Link key={f.key} href={`${base}${f.key === "all" ? "" : `&kind=${f.key}`}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={`mx-2 flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] text-txt ${filter.key === f.key ? "bg-row2 font-medium" : "hover:bg-row"}`}>
            <span>{f.label}</span>
            <span className="font-mono text-[10.5px] text-muted">{f.key === "all" ? FILTERS.slice(1).map((x) => count(x.kinds)).filter((n) => n > 0).join(" + ") || "0" : count(f.kinds)}</span>
          </Link>
        ))}
      </ListPane>

      <Reading>
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">{filter.label} <span className="ml-2 font-mono text-[12px] font-normal text-faint">{scope.repoId ? short(scope.repoId) : "all repos"} · newest first</span></h1>

        {q && scope.repoId && (
          <Section title={`Memory · “${q}”`} count={hits.length} hint={mode === "any" ? "loose match — nothing matched every word" : undefined} className="mt-6">
            {hits.length === 0 ? <Empty className="mt-2">Nothing in this repo&apos;s memory mentions that.</Empty> : (
              <div className="mt-2.5">
                {hits.map((h) => (
                  <div key={`${h.kind}-${h.id}`} className="border-t border-line py-3">
                    <div className="flex items-baseline gap-2"><Eyebrow kind={h.kind === "note" ? "standup" : h.kind}>{h.kind}</Eyebrow><span className="font-display text-[17px] text-txt">{h.title}</span><span className="ml-auto font-mono text-[11px] text-faint">{h.by ?? ""}{h.at ? ` · ${ago(h.at)}` : ""}</span></div>
                    {h.snippet && <div className="mt-1 text-[13px] leading-[1.55] text-muted">{h.snippet}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>
        )}

        {shown.length === 0 ? (
          <Empty className="mt-6">Quiet{filter.key === "journals" ? " — turn on session journals under Rules → Features" : ""}.</Empty>
        ) : (
          <div className="mt-6 grid grid-cols-[64px_1fr] gap-x-5">
            {shown.map((it) => (
              <div key={`${it.kind}-${it.id}`} className="contents">
                <span className="py-4 text-right font-mono text-[11px] text-faint">{it.kind === "standup" ? (it.day === new Date().toISOString().slice(0, 10) ? "today" : it.day.slice(5)) : ago(it.at)}</span>
                <div className={`border-b border-line py-4 ${it.kind === "handoff" && !it.open ? "text-faint" : ""}`}>
                  {it.kind === "decision" || it.kind === "broadcast" || it.kind === "bot" ? (
                    <>
                      <Eyebrow kind={it.kind}>{it.kind}</Eyebrow>
                      <span className="font-display text-[17px] text-txt">{it.text}</span>
                      <span className="ml-2.5 text-[12px] text-muted">{it.by}{!scope.repoId ? ` · ${it.repo}` : ""}</span>
                    </>
                  ) : it.kind === "journal" ? (
                    <>
                      <Eyebrow kind="journal">journal</Eyebrow>
                      <span className="text-[12px] text-muted">{it.by}{it.branch ? ` · ${it.branch}` : ""}{!scope.repoId ? ` · ${it.repo}` : ""}</span>
                      <div className="mt-1 font-display text-[17px] leading-[1.5] text-txt">{it.summary}</div>
                      {(it.learned.length + it.decided.length + it.failed.length > 0 || it.remaining) && (
                        <div className="mt-2.5 grid grid-cols-[76px_1fr] gap-x-3 gap-y-1 text-[13px] leading-[1.55] text-body">
                          {it.learned.map((l, i) => <span key={`l${i}`} className="contents"><span className="pt-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-accent2">learned</span><span>{l}</span></span>)}
                          {it.decided.map((l, i) => <span key={`d${i}`} className="contents"><span className="pt-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-accent2">decided</span><span>{l}</span></span>)}
                          {it.failed.map((l, i) => <span key={`f${i}`} className="contents"><span className="pt-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-faint">failed</span><span className="text-muted">{l}</span></span>)}
                          {it.remaining && <span className="contents"><span className="pt-[3px] font-mono text-[10px] uppercase tracking-[.1em] text-wait">remaining</span><span>{it.remaining}</span></span>}
                        </div>
                      )}
                    </>
                  ) : it.kind === "handoff" ? (
                    <>
                      <Eyebrow kind={it.open ? "handoff" : "bot"}>handoff · {it.open ? "open" : "picked up"}</Eyebrow>
                      <span className={`text-[12px] ${it.open ? "text-muted" : ""}`}>{it.by}{it.branch ? ` · ${it.branch}` : ""}{!scope.repoId ? ` · ${it.repo}` : ""}</span>
                      <div className={`mt-1 font-display text-[17px] leading-[1.5] ${it.open ? "text-txt" : ""}`}>{it.summary}{it.remaining && <i className={it.open ? "text-muted" : ""}> Remaining: {it.remaining}.</i>}</div>
                    </>
                  ) : it.kind === "standup" ? (
                    <>
                      <Eyebrow kind="standup">standup · {it.repo}</Eyebrow>
                      <div className="mt-1 whitespace-pre-line font-display text-[17px] leading-[1.55] text-body">{it.body}</div>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Reading>
    </>
  );
}
