import { PLANS, dollars } from "@/lib/billing/plans";
import { checkoutFromSite } from "./actions";

// The two plans as a site-side picker: each card's button posts to Stripe
// Checkout. Used on /welcome/plan (new team), /open (walled team) and /pricing
// (signed in). `back` is where Stripe's cancel returns.
export function PlanPicker({ back, canBuy, error }: { back: string; canBuy: boolean; error?: string | null }) {
  return (
    <div>
      {error && <p className="mb-3 rounded-[10px] border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-3.5 py-2.5 text-[13px] text-stop">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        {(["base", "scale"] as const).map((id) => {
          const p = PLANS[id];
          return (
            <form key={id} action={checkoutFromSite} className={`flex flex-col rounded-xl border px-4 py-3.5 ${id === "base" ? "border-coralline bg-coralink" : "border-line bg-row"}`}>
              <input type="hidden" name="plan" value={id} />
              <input type="hidden" name="back" value={back} />
              <div className="flex items-baseline gap-2"><span className="font-display text-[18px] font-medium text-txt">{p.name}</span><span className="font-mono text-[11px] text-muted">{dollars(p.priceCents)} / month</span></div>
              <ul className="mt-2 grid gap-1 text-[12.5px] text-body">
                <li>{p.seats} seats included, then {dollars(p.extraSeatCents)} each per month</li>
                <li>{p.actionsPerDay} AI actions a day, then {dollars(p.extraActionCents)} each</li>
                <li>Unlimited repos and teammates</li>
              </ul>
              {canBuy ? (
                <button className={`mt-3.5 rounded-[10px] px-4 py-[10px] text-[13px] font-semibold ${id === "base" ? "bg-accent2 text-white hover:brightness-110" : "border border-line2 bg-row text-txt hover:border-line3"}`}>Start 7-day trial · {p.name}</button>
              ) : (
                <p className="mt-3.5 text-[12px] text-faint">A team admin starts the plan.</p>
              )}
            </form>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px] leading-[1.6] text-faint">Card up front, nothing charged until the trial ends. A seat is any identity with a session in the month — a person on Claude Code or Cursor, or a spawned agent session. Extra seats and actions are metered on the same invoice.</p>
    </div>
  );
}
