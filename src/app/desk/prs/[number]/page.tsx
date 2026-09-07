import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { loadPrs, VERDICT } from "@/lib/desk/prs";
import { deskScope, withScope } from "@/lib/desk/scope";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { ExternalLink } from "../../external-link";
import { Card, Chip, Dot, Empty, Light, LinkButton, PageTitle } from "../../ui";

// ============================================================================
// Desk · Pull request detail — the light and why, the AI review's points, the
// merge plan (what must land first and why), files, and the exact rebase
// commands when main has moved. Merge / Open on GitHub is the one intended
// hop out of the app (the browser), via open_external.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function DeskPrDetail({ params, searchParams }: { params: Promise<{ number: string }>; searchParams: Promise<{ repo?: string }> }) {
  const { number } = await params;
  const sp = await searchParams;
  const n = Number(number);
  if (!Number.isFinite(n)) notFound();
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repoRows } = await supabase.from("linked_repos").select("id").eq("org_id", org.orgId).is("unlinked_at", null);
  const scope = await deskScope(sp, (repoRows ?? []).map((r) => r.id));
  // PR numbers are per repo; without a repo in scope, find the one that has it.
  const groups = await loadPrs(supabase, org.orgId, scope.repoId);
  const g = groups.find((x) => x.prs.some((p) => p.number === n));
  const pr = g?.prs.find((p) => p.number === n);
  if (!g || !pr) notFound();

  const step = g.plan?.order.find((s) => s.number === n) ?? null;
  const idx = g.plan?.order.findIndex((s) => s.number === n) ?? -1;
  const before = idx > 0 ? g.plan!.order.slice(0, idx).filter((s) => step?.overlapsWith.includes(s.number)) : [];
  const v = pr.review ? VERDICT[pr.review.verdict] ?? VERDICT.caution : null;
  const needsRebase = pr.mergeable_state === "dirty" || Boolean(pr.rebase);
  const rebaseCmd = `git fetch origin && git merge origin/${pr.default_branch}`;

  return (
    <>
      <Link href={withScope("/desk/prs", scope)} className="font-mono text-[10px] text-faint hover:text-brand-400">← pull requests</Link>
      <PageTitle
        title={<><span className="font-mono text-[15px] text-[var(--wg-code)]">#{pr.number}</span> {pr.title}</>}
        sub={<span className="flex items-center gap-2">{pr.author ?? "?"} · {g.full_name} · {pr.head_branch ?? "?"} → {pr.base_branch ?? pr.default_branch} {pr.light && <Light state={pr.light.state} reason={pr.light.reason} />}<span>{pr.light?.reason}</span></span>}
        right={pr.html_url ? <ExternalLink href={pr.html_url}><LinkButton>{pr.light?.state === "green" ? "Merge on GitHub ↗" : "Open on GitHub ↗"}</LinkButton></ExternalLink> : null}
      />

      <div className="grid grid-cols-[1.3fr_1fr] gap-2.5">
        <div>
          <Card title="AI review" right={pr.review ? new Date(pr.review.created_at).toLocaleString() : undefined}>
            {!pr.review ? (
              <Empty>Not reviewed yet — the tick reviews one new PR head every two minutes.</Empty>
            ) : (
              <>
                <div className="mb-1.5 flex items-center gap-2 text-[12.5px]"><Dot level={v!.tone} /><span className="font-mono text-[10.5px] uppercase tracking-wide text-muted">{v!.label}</span><span className="text-txt">{pr.review.summary}</span></div>
                {pr.review.points.length === 0 ? (
                  <Empty>No points — a clean diff.</Empty>
                ) : (
                  pr.review.points.map((p, i) => (
                    <div key={i} className="flex items-start gap-2 border-t border-line py-1.5 text-[12px]">
                      <span className={"mt-0.5 font-mono text-[9.5px] uppercase " + (p.kind === "risk" ? "text-stop" : p.kind === "brain" ? "text-wait" : "text-[var(--wg-violet)]")}>{p.kind}</span>
                      <span className="text-txt">{p.text}</span>
                    </div>
                  ))
                )}
              </>
            )}
          </Card>
          <Card title="Merge plan">
            {!g.plan || g.plan.order.length < 2 ? (
              <Empty>Only one open PR here — no ordering to work out.</Empty>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-1.5 py-1 text-[12px]">
                  {g.plan.order.map((s, i) => (
                    <span key={s.number} className="flex items-center gap-1.5">
                      <Link href={withScope(`/desk/prs/${s.number}`, g.repo_id)} className={s.number === n ? "" : "hover:text-brand-400"}><Chip tone={s.number === n ? "violet" : "code"}>#{s.number}</Chip></Link>
                      {i < g.plan!.order.length - 1 && <span className="text-faint">→</span>}
                    </span>
                  ))}
                </div>
                {step && <p className="mt-1 text-[12px] text-muted">{step.reason}</p>}
                {before.length > 0 && (
                  <p className="mt-1 text-[12px] text-wait">Lands after {before.map((b) => `#${b.number}`).join(", ")} — you share files, so this one needs a rebase after {before.length === 1 ? "it" : "they"} merge{before.length === 1 ? "s" : ""}.</p>
                )}
              </>
            )}
          </Card>
        </div>
        <div>
          <Card title="Status">
            <div className="flex flex-wrap gap-1.5 py-1">
              {pr.draft && <Chip tone="muted">draft</Chip>}
              <Chip tone={pr.mergeable_state === "dirty" ? "muted" : "code"}>{pr.mergeable_state === "dirty" ? `conflicts with ${pr.default_branch}` : pr.mergeable_state === "clean" ? "merges clean" : pr.mergeable_state === "behind" ? `behind ${pr.default_branch}` : "merge check pending"}</Chip>
              <Chip tone={pr.review_state === "approved" ? "violet" : "code"}>{pr.review_state === "approved" ? "approved" : pr.review_state === "changes_requested" ? "changes requested" : "awaiting review"}</Chip>
              {pr.head_sha && <Chip tone="muted">{pr.head_sha.slice(0, 7)}</Chip>}
            </div>
          </Card>
          <Card title="Files" count={pr.changed_files.length}>
            {pr.changed_files.length === 0 ? <Empty>No file list yet.</Empty> : <div className="flex flex-wrap gap-1 py-1">{pr.changed_files.map((f) => <Chip key={f}>{f}</Chip>)}</div>}
          </Card>
          <Card title="Rebase" right={needsRebase ? undefined : "not needed"}>
            {needsRebase ? (
              <>
                <p className="text-[12px] text-muted">
                  {pr.mergeable_state === "dirty" ? `This branch conflicts with ${pr.default_branch}. ` : ""}
                  {pr.rebase ? `Main moved underneath it: #${pr.rebase.after.join(", #")} merged after this PR's last push and touched ${pr.rebase.files.join(", ")}. ` : ""}
                  The union merge rules auto-resolve the brain notes; resolve anything else, re-run the build, push.
                </p>
                <pre className="mt-2 overflow-x-auto rounded-lg border border-line2 bg-ink px-2.5 py-2 font-mono text-[11px] text-[var(--wg-code)]">{`git checkout ${pr.head_branch ?? "<branch>"}\n${rebaseCmd}`}</pre>
                <p className="mt-2 text-[11px] text-faint">Or tell your Claude: &ldquo;Rebase #{pr.number} onto {pr.default_branch} and push.&rdquo; It sees the same radar in its context.</p>
              </>
            ) : (
              <Empty>Up to date with {pr.default_branch}.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
