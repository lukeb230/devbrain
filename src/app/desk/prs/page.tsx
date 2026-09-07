import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPrs, VERDICT } from "@/lib/desk/prs";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { Card, Chip, Dot, Empty, Light, PageTitle } from "../ui";

// ============================================================================
// Desk · Pull requests — every open PR with its light and the light's reason,
// the merge order with its one-line explanation, the AI verdict, and a rebase
// flag when main has moved underneath. Team-wide or one repo. Read-only.
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
  const total = groups.reduce((n, g) => n + g.prs.length, 0);
  const shown = groups.filter((g) => g.prs.length > 0);

  return (
    <>
      <PageTitle title="Pull requests" sub={`${total} open · ${scope.repoId ? groups[0]?.full_name ?? "" : "all repos"} · lights are deterministic and every light says why`} />
      {shown.length === 0 && <Empty>No open pull requests.</Empty>}
      {shown.map((g) => (
        <section key={g.repo_id} className="mb-4">
          {!scope.repoId && <h2 className="mb-1.5 font-mono text-[11px] text-muted">{g.full_name}</h2>}
          {g.plan && g.plan.order.length > 1 && (
            <Card title="Merge order" right={g.plan.overlaps.length ? `${g.plan.overlaps.length} overlapping pair${g.plan.overlaps.length === 1 ? "" : "s"}` : "no overlapping files"}>
              <div className="flex flex-wrap items-center gap-1.5 py-1 text-[12px]">
                {g.plan.order.map((s, i) => (
                  <span key={s.number} className="flex items-center gap-1.5">
                    <Link href={withScope(`/desk/prs/${s.number}`, g.repo_id)} title={s.reason} className="hover:text-brand-400"><Chip>#{s.number}</Chip></Link>
                    {i < g.plan!.order.length - 1 && <span className="text-faint">→</span>}
                  </span>
                ))}
                <span className="ml-2 text-[11px] text-muted">{g.plan.order[0]?.reason}</span>
              </div>
            </Card>
          )}
          {g.prs.map((p) => {
            const v = p.review ? VERDICT[p.review.verdict] ?? VERDICT.caution : null;
            return (
              <Link key={p.number} href={withScope(`/desk/prs/${p.number}`, g.repo_id)} className="mb-1.5 block rounded-xl border border-line bg-row px-3.5 py-2.5 hover:border-brand-500">
                <div className="flex items-center gap-3">
                  {p.light ? <Light state={p.light.state} reason={p.light.reason} /> : <Chip tone="muted">draft</Chip>}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] text-txt"><span className="font-mono text-[11px] text-[var(--wg-code)]">#{p.number}</span> {p.title}</div>
                    <div className="truncate text-[10.5px] text-muted">{p.author ?? "?"} · {p.light?.reason ?? (p.draft ? "draft — not in the merge order" : "")}</div>
                  </div>
                  {p.rebase && <span className="flex items-center gap-1 font-mono text-[10px] text-wait" title={`shares ${p.rebase.files.join(", ")} with #${p.rebase.after.join(", #")}`}><Dot level="wait" /> rebase</span>}
                  {v && <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted"><Dot level={v.tone} /> AI · {v.label}</span>}
                  <span className="font-mono text-[10px] text-faint">{p.changed_files.length} files</span>
                </div>
              </Link>
            );
          })}
        </section>
      ))}
    </>
  );
}
