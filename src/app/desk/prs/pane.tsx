import Link from "next/link";
import type { RepoPrs } from "@/lib/desk/prs";
import { VERDICT } from "@/lib/desk/prs";
import { withScope } from "@/lib/desk/scope";
import { ListPane, ListRow, PaneEyebrow } from "../panes";
import { Dot } from "../ui";

// The Pull requests list pane (Dusk), shared by the list route and the
// detail route: merge-order strip, then one row per PR with its light dot,
// "author · light · AI verdict"; drafts faint with a ring dot.

const LIGHT_TEXT: Record<string, string> = { green: "text-go", yellow: "text-wait", red: "text-stop" };

export function PrPane({ groups, scopeAll, current }: { groups: RepoPrs[]; scopeAll: boolean; current: number | null }) {
  const total = groups.reduce((n, g) => n + g.prs.length, 0);
  const shown = groups.filter((g) => g.prs.length > 0);
  return (
    <ListPane title="Pull requests" count={`${total} open`}>
      {shown.length === 0 && <p className="px-4 py-1 text-[12.5px] leading-[1.55] text-faint">No open pull requests.</p>}
      {shown.map((g) => (
        <div key={g.repo_id} className="pb-2">
          {scopeAll && <PaneEyebrow>{g.full_name}</PaneEyebrow>}
          {g.plan && g.plan.order.length > 1 && (
            <div className="mx-4 mb-2.5 rounded-lg border border-line bg-row px-2.5 py-2 font-mono text-[10.5px] text-muted">
              merge order{" "}
              {g.plan.order.map((s, i) => {
                const pr = g.prs.find((p) => p.number === s.number);
                return (
                  <span key={s.number}>
                    <Link href={withScope(`/desk/prs/${s.number}`, g.repo_id)} className={`${LIGHT_TEXT[pr?.light?.state ?? ""] ?? "text-txt"} hover:underline`} title={s.reason}>#{s.number}</Link>
                    {i < g.plan!.order.length - 1 ? " → " : ""}
                  </span>
                );
              })}
              {g.plan.overlaps.length > 0 ? ` · ${g.plan.overlaps.length} overlap${g.plan.overlaps.length === 1 ? "" : "s"}` : ""}
            </div>
          )}
          {g.prs.map((p) => {
            const v = p.review ? VERDICT[p.review.verdict] ?? VERDICT.caution : null;
            const level = p.draft || !p.light ? "draft" : p.light.state === "green" ? "go" : p.light.state === "red" ? "stop" : "wait";
            return (
              <ListRow key={p.number} href={withScope(`/desk/prs/${p.number}`, g.repo_id)} selected={current === p.number} dim={p.draft} pad="10px 10px">
                <div className="flex gap-2.5">
                  <span className="mt-[5px]"><Dot level={level} size={8} glow={false} /></span>
                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[13px] ${current === p.number ? "font-medium" : ""}`}><span className={`mr-1 font-mono text-[11px] ${p.draft ? "" : "text-muted"}`}>#{p.number}</span>{p.title}</div>
                    <div className={`mt-0.5 truncate text-[11px] ${p.draft ? "" : "text-muted"}`}>
                      {p.author ?? "?"} · {p.draft ? "draft — not in the order" : p.light ? (p.light.state === "green" ? "cleared" : p.light.state === "red" ? "conflicts" : "hold") : "pending"}{p.rebase ? " · rebase" : ""}{v ? ` · AI ${v.label}` : ""}
                    </div>
                  </div>
                </div>
              </ListRow>
            );
          })}
        </div>
      ))}
    </ListPane>
  );
}
