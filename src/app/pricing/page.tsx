import Link from "next/link";
import { PlanPicker } from "@/app/billing/plan-picker";
import { PLANS, dollars } from "@/lib/billing/plans";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "../browser-shell";

// ============================================================================
// /pricing — the two plans. Signed out: the table and a sign-in link. Signed
// in with a team that has no subscription: the picker starts Checkout here.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function Pricing({ searchParams }: { searchParams: Promise<{ billing_error?: string; checkout?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  const org = user ? await currentOrg() : null;
  const rows: [string, string, string][] = [
    ["Price", `${dollars(PLANS.base.priceCents)} / month`, `${dollars(PLANS.scale.priceCents)} / month`],
    ["Seats included", String(PLANS.base.seats), String(PLANS.scale.seats)],
    ["Each extra seat", `${dollars(PLANS.base.extraSeatCents)} / month`, `${dollars(PLANS.scale.extraSeatCents)} / month`],
    ["AI actions per day", String(PLANS.base.actionsPerDay), String(PLANS.scale.actionsPerDay)],
    ["Each extra action", dollars(PLANS.base.extraActionCents), dollars(PLANS.scale.extraActionCents)],
    ["Repos and teammates", "unlimited", "unlimited"],
    ["Trial", "7 days, card up front", "7 days, card up front"],
  ];
  return (
    <BrowserShell>
      <main className="mx-auto max-w-[720px] px-8 py-14">
        <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-accent">Pricing</div>
        <h1 className="mt-2 font-display text-[34px] font-medium tracking-[-.02em] text-txt">Per team, not per seat</h1>
        <p className="mt-2 max-w-[58ch] text-[14px] leading-[1.6] text-muted">One price for the whole team, a bucket of seats that counts people and their agents the same, and metered extras on the same invoice. Nothing is blocked mid-month.</p>

        <div className="mt-8 overflow-x-auto rounded-xl border border-line bg-row">
          <table className="w-full text-[13.5px]">
            <thead><tr className="border-b border-line font-mono text-[10.5px] uppercase tracking-[.1em] text-muted"><th className="px-4 py-3 text-left font-medium"></th><th className="px-4 py-3 text-left font-medium">Base</th><th className="px-4 py-3 text-left font-medium">Scale</th></tr></thead>
            <tbody>
              {rows.map(([k, a, b]) => (
                <tr key={k} className="border-b border-line last:border-b-0"><td className="px-4 py-2.5 text-txt">{k}</td><td className="px-4 py-2.5 font-mono text-[12.5px] text-body">{a}</td><td className="px-4 py-2.5 font-mono text-[12.5px] text-body">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8">
          {org ? (
            <PlanPicker back="/pricing" canBuy={hasRole(org.role, "admin")} error={sp.billing_error} />
          ) : (
            <p className="text-[13.5px] text-muted"><Link href="/" className="text-accent hover:underline">Sign in with GitHub</Link> to create a team and start the trial.</p>
          )}
        </div>

        <div className="mt-10 grid gap-2 text-[12.5px] leading-[1.6] text-muted">
          <p><b className="font-medium text-txt">What counts as a seat.</b> Any identity with at least one session in the billing month: a human on Claude Code or Cursor, or a spawned agent session. Someone on vacation costs nothing.</p>
          <p><b className="font-medium text-txt">What counts as an AI action.</b> A PR review, a task match on merge, a session journal, a daily digest and standup per repo, a task footprint, a spec analysis. Presence, collision checks, claims and handoffs never count.</p>
          <p><b className="font-medium text-txt">Past the daily allowance.</b> Actions keep running as overage at {dollars(PLANS.base.extraActionCents)} each until the team&apos;s monthly limit ({dollars(PLANS.base.overageLimitCents)} on Base, {dollars(PLANS.scale.overageLimitCents)} on Scale by default, adjustable), then pause until the next day.</p>
        </div>
      </main>
    </BrowserShell>
  );
}
