import { redirect } from "next/navigation";
import { loadPrs } from "@/lib/desk/prs";
import { deskScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { Reading } from "../panes";
import Link from "next/link";
import { Empty, H1, Light, Pill, Section } from "../ui";
import { PrPane } from "./pane";
import { PrDetail } from "./detail";

// ============================================================================
// Desk · Pull requests (Dusk). List pane: merge order + one row per PR.
// Reading pane: one repo → the first PR in merge order (a selection is
// /prs/<n>); all repos → a per-repo overview (lights, merge order, next to land).
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
  const shown = groups.filter((x) => x.prs.length > 0);
  const total = shown.reduce((n, x) => n + x.prs.length, 0);

  // One repo in scope: the first PR in merge order is the natural selection.
  // All repos: an overview per repo instead of an arbitrary first PR.
  if (scope.repoId) {
    const g = shown[0] ?? null;
    const first = g ? (g.plan?.order[0] ? g.prs.find((p) => p.number === g.plan!.order[0].number) ?? g.prs[0] : g.prs[0]) : null;
    return (
      <>
        <PrPane groups={groups} scopeAll={false} current={first?.number ?? null} />
        {g && first ? (
          <PrDetail g={g} pr={first} />
        ) : (
          <Reading>
            <H1 title="Pull requests" sub={`${groups[0]?.full_name ?? ""} · lights are deterministic and every light says why`} />
            <Empty className="mt-6">No open pull requests.</Empty>
          </Reading>
        )}
      </>
    );
  }

  const LIGHT: Record<string, "go" | "wait" | "stop"> = { green: "go", yellow: "wait", red: "stop" };
  return (
    <>
      <PrPane groups={groups} scopeAll current={null} />
      <Reading>
        <H1 title="Pull requests" sub={`${total} open across ${shown.length} repo${shown.length === 1 ? "" : "s"} · lights are deterministic and every light says why · pick a PR on the left, or scope one repo`} />
        {shown.length === 0 && <Empty className="mt-6">No open pull requests.</Empty>}
        {shown.map((g) => {
          const counts = { go: 0, wait: 0, stop: 0, draft: 0 };
          for (const p of g.prs) { if (p.draft || !p.light) counts.draft++; else counts[LIGHT[p.light.state] ?? "wait"]++; }
          const next = g.plan?.order[0] ? g.prs.find((p) => p.number === g.plan!.order[0].number) ?? null : null;
          return (
            <Section key={g.repo_id} title={g.full_name} count={g.prs.length} right={<Link href={`/desk/prs?repo=${g.repo_id}`} className="text-accent hover:underline">scope ↗</Link>}>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 font-mono text-[11px]">
                {counts.go > 0 && <span className="text-go">{counts.go} cleared</span>}
                {counts.wait > 0 && <span className="text-wait">{counts.wait} on hold</span>}
                {counts.stop > 0 && <span className="text-stop">{counts.stop} with conflicts</span>}
                {counts.draft > 0 && <span className="text-faint">{counts.draft} draft</span>}
              </div>
              {g.plan && g.plan.order.length > 1 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 font-mono text-[13px]">
                  <span className="text-[10.5px] uppercase tracking-[.1em] text-faint">merge order</span>
                  {g.plan.order.map((s, i) => (
                    <span key={s.number} className="flex items-center gap-2.5">
                      <Link href={`/desk/prs/${s.number}?repo=${g.repo_id}`} className={`${LIGHT[g.prs.find((p) => p.number === s.number)?.light?.state ?? ""] === "go" ? "text-go" : LIGHT[g.prs.find((p) => p.number === s.number)?.light?.state ?? ""] === "stop" ? "text-stop" : "text-wait"} hover:underline`} title={s.reason}>#{s.number}</Link>
                      {i < g.plan!.order.length - 1 && <span className="text-faint">→</span>}
                    </span>
                  ))}
                  {g.plan.overlaps.length > 0 && <span className="text-[11px] text-muted">· {g.plan.overlaps.length} overlap{g.plan.overlaps.length === 1 ? "" : "s"}</span>}
                </div>
              )}
              {next && (
                <div className="mt-2.5 flex items-center gap-3 border-t border-line py-2.5">
                  {next.light ? <Light state={next.light.state} reason={next.light.reason} /> : <Pill tone="muted">draft</Pill>}
                  <Link href={`/desk/prs/${next.number}?repo=${g.repo_id}`} className="min-w-0 flex-1 truncate text-[13.5px] text-txt hover:underline"><span className="mr-1.5 font-mono text-[11px] text-muted">#{next.number}</span>{next.title}</Link>
                  <span className="truncate font-mono text-[10.5px] text-muted">next to land{next.light?.reason ? ` · ${next.light.reason}` : ""}</span>
                </div>
              )}
            </Section>
          );
        })}
      </Reading>
    </>
  );
}
