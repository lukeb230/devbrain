import Link from "next/link";
import type { RepoPrs } from "@/lib/desk/prs";
import { VERDICT } from "@/lib/desk/prs";
import { withScope } from "@/lib/desk/scope";
import { ExternalLink } from "../external-link";
import { Reading } from "../panes";
import { Card, Empty, Eyebrow, Light, LinkButton, Pill, Section } from "../ui";

// ============================================================================
// The PR reading pane (Dusk): light pill + reason, "#n Title", the who/where
// line, status pills, AI review (verdict + points with mono kind labels),
// Merge plan, Files (shared files in wait), the Rebase card. Merge / Open on
// GitHub is the one intended hop out of the app (open_external).
// ============================================================================

const KIND: Record<string, string> = { risk: "text-stop", brain: "text-wait", note: "text-violet" };
const VTEXT: Record<string, string> = { go: "text-go", wait: "text-wait", stop: "text-stop", dim: "text-faint" };

export function PrDetail({ g, pr }: { g: RepoPrs; pr: RepoPrs["prs"][number] }) {
  const n = pr.number;
  const step = g.plan?.order.find((s) => s.number === n) ?? null;
  const idx = g.plan?.order.findIndex((s) => s.number === n) ?? -1;
  const before = idx > 0 ? g.plan!.order.slice(0, idx).filter((s) => step?.overlapsWith.includes(s.number)) : [];
  const v = pr.review ? VERDICT[pr.review.verdict] ?? VERDICT.caution : null;
  const needsRebase = pr.mergeable_state === "dirty" || Boolean(pr.rebase);
  const rebaseCmd = `git fetch origin && git merge origin/${pr.default_branch}`;
  const shared = new Set(pr.rebase?.files ?? []);
  const sharedWith = pr.rebase ? `#${pr.rebase.after.join(", #")}` : "";

  return (
    <Reading>
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            {pr.light ? <Light state={pr.light.state} reason={pr.light.reason} /> : <Pill tone="muted">draft</Pill>}
            <span className="text-[12.5px] text-muted">{pr.light?.reason ?? (pr.draft ? "draft — not in the merge order" : "")}</span>
          </div>
          <h1 className="mt-2.5 font-display text-[32px] font-medium leading-[1.1] tracking-[-.02em] text-txt"><span className="mr-2 font-mono text-[16px] text-faint">#{n}</span>{pr.title}</h1>
          <p className="mt-2.5 text-[13px] text-muted">{pr.author ?? "?"} · {g.full_name} · <span className="font-mono">{pr.head_branch ?? "?"} → {pr.base_branch ?? pr.default_branch}</span>{pr.head_sha ? ` · ${pr.head_sha.slice(0, 7)}` : ""}</p>
        </div>
        {pr.html_url && <ExternalLink href={pr.html_url}><LinkButton>{pr.light?.state === "green" ? "Merge on GitHub ↗" : "Open on GitHub ↗"}</LinkButton></ExternalLink>}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {pr.draft && <Pill tone="muted">draft</Pill>}
        <Pill tone={pr.mergeable_state === "dirty" ? "muted" : "outline"}>{pr.mergeable_state === "dirty" ? `conflicts with ${pr.default_branch}` : pr.mergeable_state === "clean" ? "merges clean" : pr.mergeable_state === "behind" ? `behind ${pr.default_branch}` : "merge check pending"}</Pill>
        <Pill tone={pr.review_state === "approved" ? "violet" : "outline"}>{pr.review_state === "approved" ? "approved" : pr.review_state === "changes_requested" ? "changes requested" : "awaiting review"}</Pill>
        <Pill tone="muted">{needsRebase ? "rebase needed" : `rebase not needed · up to date with ${pr.default_branch}`}</Pill>
      </div>

      <div className="mt-7 grid grid-cols-[1.3fr_1fr] gap-8">
        <div>
          <Section className="" title="AI review" hint={pr.review ? <span className="font-mono text-[10.5px]">{new Date(pr.review.created_at).toLocaleString()}</span> : undefined}>
            {!pr.review ? (
              <Empty className="mt-2">Not reviewed yet — the tick reviews one new PR head every two minutes.</Empty>
            ) : (
              <>
                <p className="mt-2.5 text-[14px] leading-[1.6] text-txt"><span className={`mr-2 font-mono text-[11px] uppercase tracking-[.08em] ${VTEXT[v!.tone]}`}>{v!.label}</span>{pr.review.summary}</p>
                {pr.review.points.length === 0 ? (
                  <Empty className="mt-2">No points — a clean diff.</Empty>
                ) : (
                  <div className="mt-3">
                    {pr.review.points.map((p, i) => (
                      <div key={i} className="grid grid-cols-[52px_1fr] gap-3 border-t border-line py-2.5 text-[13px] leading-[1.5] text-txt">
                        <span className={`pt-0.5 font-mono text-[10.5px] uppercase ${KIND[p.kind] ?? "text-violet"}`}>{p.kind}</span>
                        <span>{p.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </Section>
          <Section title="Merge plan">
            {!g.plan || g.plan.order.length < 2 ? (
              <Empty className="mt-2">Only one open PR here — no ordering to work out.</Empty>
            ) : (
              <>
                <div className="mt-2.5 flex flex-wrap items-center gap-2.5 font-mono text-[13px]">
                  {g.plan.order.map((s, i) => (
                    <span key={s.number} className="flex items-center gap-2.5">
                      {s.number === n ? <span className="rounded-md bg-violetbg px-2 py-[3px] text-violet">#{s.number}</span> : <Link href={withScope(`/desk/prs/${s.number}`, g.repo_id)} className="text-muted hover:text-txt">#{s.number}</Link>}
                      {i < g.plan!.order.length - 1 && <span className="text-faint">→</span>}
                    </span>
                  ))}
                </div>
                {step && <p className="mt-2 text-[13px] leading-[1.6] text-muted">{step.reason}</p>}
                {before.length > 0 && <p className="mt-2 text-[13px] leading-[1.6] text-wait">Lands after {before.map((b) => `#${b.number}`).join(", ")} — you share files, so this one needs a rebase after {before.length === 1 ? "it" : "they"} merge{before.length === 1 ? "s" : ""}.</p>}
              </>
            )}
          </Section>
        </div>
        <div>
          <Section className="" title="Files" count={pr.changed_files.length}>
            {pr.changed_files.length === 0 ? (
              <Empty className="mt-2">No file list yet.</Empty>
            ) : (
              <div className="mt-2.5 font-mono text-[12px] leading-[2] text-body">
                {pr.changed_files.map((f) => (
                  <div key={f} className="truncate">{shared.has(f) ? <><span className="text-wait">{f}</span> <span className="text-[10.5px] text-faint">· shared with {sharedWith}</span></> : f}</div>
                ))}
              </div>
            )}
          </Section>
          <Card pad="none" className="mt-6 rounded-[10px] px-4 py-3.5">
            <Eyebrow>rebase</Eyebrow>
            {needsRebase ? (
              <>
                <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">
                  {pr.mergeable_state === "dirty" ? `This branch conflicts with ${pr.default_branch}. ` : ""}
                  {pr.rebase ? `Main moved underneath it: #${pr.rebase.after.join(", #")} merged after this PR's last push and touched ${pr.rebase.files.join(", ")}. ` : ""}
                  The union merge rules auto-resolve the brain notes; resolve anything else, re-run the build, push.
                </p>
                <code className="mt-2 block rounded-lg bg-codebg px-3.5 py-2.5 font-mono text-[12px] leading-[1.6] text-codefg">{`git checkout ${pr.head_branch ?? "<branch>"}\n${rebaseCmd}`}</code>
                <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">Or tell your Claude &ldquo;Rebase #{n} onto {pr.default_branch} and push.&rdquo; It sees the same radar in its context.</p>
              </>
            ) : (
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">Not needed — up to date with {pr.default_branch}. When it is: <code className="font-mono text-[11px]">{rebaseCmd}</code>, or tell your Claude &ldquo;Rebase #{n} onto {pr.default_branch} and push.&rdquo;</p>
            )}
          </Card>
        </div>
      </div>
    </Reading>
  );
}
