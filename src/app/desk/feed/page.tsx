import { redirect } from "next/navigation";
import { deskScope } from "@/lib/desk/scope";
import { formatHit, type MemoryHit } from "@/lib/memory";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { RepoChooser } from "../repo-chooser";
import { Card, Chip, Empty, Field, PageTitle } from "../ui";

// ============================================================================
// Desk · Feed & memory — decisions, broadcasts, handoffs, session journals
// (full text), the standup archive, and team memory search over all of it.
// Team-wide or one repo; search needs one repo (memory is indexed per repo).
// Read-only.
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
const KIND_TONE: Record<string, "code" | "violet" | "muted"> = { decision: "violet", broadcast: "code", bot_write: "muted", handoff: "code", journal: "violet" };

export default async function DeskFeed({ searchParams }: { searchParams: Promise<{ repo?: string; q?: string }> }) {
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

  const [{ data: events }, { data: journals }, { data: digests }, { data: handoffs }] = await Promise.all([
    supabase.from("events").select("id, kind, payload, at, repo_id").in("repo_id", ids).in("kind", ["decision", "broadcast", "bot_write"]).order("at", { ascending: false }).limit(60),
    supabase.from("journals").select("id, repo_id, dev_label, branch, summary, learned, decisions, tried_and_failed, remaining, at").in("repo_id", ids).order("at", { ascending: false }).limit(20),
    supabase.from("digests").select("day, body, repo_id").in("repo_id", ids).order("day", { ascending: false }).limit(14),
    supabase.from("handoffs").select("id, repo_id, dev_label, branch, summary, remaining, picked_up_at, created_at").in("repo_id", ids).order("created_at", { ascending: false }).limit(20),
  ]);

  let hits: ReturnType<typeof formatHit>[] = [];
  let mode: "strict" | "any" | null = null;
  if (q && scope.repoId) {
    const admin = supabaseAdmin();
    mode = "strict";
    let { data } = await admin.rpc("memory_search", { p_repo: scope.repoId, p_q: q, p_limit: 12, p_mode: mode });
    if ((data ?? []).length === 0) { mode = "any"; ({ data } = await admin.rpc("memory_search", { p_repo: scope.repoId, p_q: q, p_limit: 12, p_mode: mode })); }
    hits = ((data ?? []) as MemoryHit[]).map(formatHit);
  }

  return (
    <>
      <PageTitle title="Feed & memory" sub={`${scope.repoId ? short(scope.repoId) : "all repos"} · decisions, broadcasts, bot writes, journals, handoffs, standups — and search across every journal, decision and note`} />

      <form method="get" className="mb-3 flex items-center gap-2">
        {scope.repoId && <input type="hidden" name="repo" value={scope.repoId} />}
        <Field name="q" defaultValue={q} placeholder={scope.repoId ? "has anyone dealt with…  (searches journals, decisions, handoffs, reviews, notes for this repo)" : "pick one repo to search its memory"} />
        <button className="rounded-lg border border-line2 px-3 py-1.5 font-display text-[11.5px] font-semibold text-muted hover:text-txt" disabled={!scope.repoId}>Search</button>
      </form>
      {!scope.repoId && q && <RepoChooser repos={repos ?? []} route="/desk/feed" what="memory" />}
      {q && scope.repoId && (
        <Card title={`Memory · "${q}"`} count={hits.length} right={mode === "any" ? "loose match — nothing matched every word" : undefined}>
          {hits.length === 0 ? <Empty>Nothing in this repo&apos;s memory mentions that.</Empty> : hits.map((h) => (
            <div key={`${h.kind}-${h.id}`} className="border-t border-line py-2 first:border-t-0">
              <div className="flex items-center gap-2 text-[12.5px]"><Chip tone={KIND_TONE[h.kind] ?? "muted"}>{h.kind}</Chip><span className="text-txt">{h.title}</span><span className="ml-auto font-mono text-[10px] text-faint">{h.by ?? ""}{h.at ? ` · ${ago(h.at)}` : ""}</span></div>
              {h.snippet && <div className="mt-0.5 text-[11.5px] text-muted">{h.snippet}</div>}
            </div>
          ))}
        </Card>
      )}

      <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
        <div>
          <Card title="Feed" count={(events ?? []).length}>
            {(events ?? []).length === 0 ? <Empty>Quiet.</Empty> : (events ?? []).map((e) => {
              const p = (e.payload ?? {}) as { text?: string; by?: string; action?: string };
              return (
                <div key={e.id} className="flex items-start gap-2 border-t border-line py-1.5 first:border-t-0">
                  <span className="mt-0.5 w-12 flex-shrink-0 font-mono text-[10px] text-faint">{ago(e.at)}</span>
                  <Chip tone={KIND_TONE[e.kind] ?? "muted"}>{e.kind === "bot_write" ? "bot" : e.kind}</Chip>
                  <div className="min-w-0 flex-1 text-[12px] text-txt">{p.text ?? p.action ?? ""}<span className="ml-1.5 font-mono text-[10px] text-muted">{p.by ?? "DevBrain"}{!scope.repoId ? ` · ${short(e.repo_id)}` : ""}</span></div>
                </div>
              );
            })}
          </Card>
          <Card title="Session journals" count={(journals ?? []).length}>
            {(journals ?? []).length === 0 ? <Empty>No journals yet — turn on session journals under Rules → Features.</Empty> : (journals ?? []).map((j) => (
              <details key={j.id} className="border-t border-line py-1.5 first:border-t-0">
                <summary className="cursor-pointer list-none text-[12.5px] text-txt"><span className="font-mono text-[10.5px] text-muted">{j.dev_label}{j.branch ? ` · ${j.branch}` : ""}{!scope.repoId ? ` · ${short(j.repo_id)}` : ""} · {ago(j.at)}</span><div>{j.summary}</div></summary>
                <div className="mt-1.5 space-y-1 text-[11.5px]">
                  {((j.learned as string[]) ?? []).map((l, i) => <div key={`l${i}`}><Chip tone="violet">learned</Chip> <span className="text-txt">{l}</span></div>)}
                  {((j.decisions as string[]) ?? []).map((l, i) => <div key={`d${i}`}><Chip tone="violet">decided</Chip> <span className="text-txt">{l}</span></div>)}
                  {((j.tried_and_failed as string[]) ?? []).map((l, i) => <div key={`f${i}`}><Chip tone="muted">failed</Chip> <span className="text-txt">{l}</span></div>)}
                  {j.remaining && <div><Chip tone="code">remaining</Chip> <span className="text-txt">{j.remaining}</span></div>}
                </div>
              </details>
            ))}
          </Card>
        </div>
        <div>
          <Card title="Standups" count={(digests ?? []).length}>
            {(digests ?? []).length === 0 ? <Empty>No standups yet.</Empty> : (digests ?? []).map((d) => (
              <details key={`${d.repo_id}-${d.day}`} className="border-t border-line py-1.5 first:border-t-0">
                <summary className="cursor-pointer list-none font-mono text-[11px] text-muted">{d.day}{!scope.repoId ? ` · ${short(d.repo_id)}` : ""}</summary>
                <p className="mt-1 whitespace-pre-line text-[12px] leading-relaxed text-txt">{d.body}</p>
              </details>
            ))}
          </Card>
          <Card title="Handoffs" count={(handoffs ?? []).length}>
            {(handoffs ?? []).length === 0 ? <Empty>None.</Empty> : (handoffs ?? []).map((h) => (
              <div key={h.id} className="border-t border-line py-1.5 first:border-t-0 text-[12px]">
                <div className="font-mono text-[10.5px] text-muted">{h.dev_label}{h.branch ? ` · ${h.branch}` : ""} · {ago(h.created_at)} · {h.picked_up_at ? "picked up" : "open"}</div>
                <div className="text-txt">{h.summary}</div>
                {h.remaining && <div className="text-muted">remaining: {h.remaining}</div>}
              </div>
            ))}
          </Card>
        </div>
      </div>
    </>
  );
}
