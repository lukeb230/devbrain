import { redirect } from "next/navigation";
import { setOverageLimit } from "@/app/settings/org/actions";
import { PLANS, dollars, estimateInvoice, scaleSavingsCents } from "@/lib/billing/plans";
import { loadBilling, type BillingSnapshot } from "@/lib/billing/usage";
import { WALL_COPY, wallReason } from "@/lib/billing/wall";
import { currentOrg, hasRole } from "@/lib/org";
import { DeskNext } from "../../desk-next";
import { Reading } from "../../panes";
import { Button, Field, Section } from "../../ui";
import { BillingButtons } from "./billing-buttons";
import { Counter, STATUS_LABEL } from "./counters";

// ============================================================================
// /desk/plan — the team's plan: status, trial countdown, the three usage
// counters, what this period's invoice will be, upgrade / manage billing,
// and the overage limit. When the team is not entitled, PlanWall (below)
// is what the whole Console shows instead of any page.
// ============================================================================

export const dynamic = "force-dynamic";

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—");
const daysLeft = (iso: string | null) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000)) : null);

export default async function DeskPlan({ searchParams }: { searchParams: Promise<{ checkout?: string }> }) {
  const sp = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/?from=desk");
  const billing = await loadBilling(me.orgId);
  if (!billing) redirect("/desk/team");
  const isAdmin = hasRole(me.role, "admin");
  const trialDays = billing.status === "trialing" ? daysLeft(billing.trialEndsAt) : null;
  const est = estimateInvoice(billing.plan, billing.usage);
  const savings = billing.plan.id === "base" ? scaleSavingsCents(billing.usage) : 0;

  return (
    <>
      <Reading>
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Plan</h1>
        <p className="mt-2 text-[13px] text-muted">
          {billing.betaFree ? `Free beta · ${billing.plan.actionsPerDay} AI actions a day, no card, no trial clock` : `${billing.plan.name} · ${STATUS_LABEL[billing.status] ?? billing.status}`}
          {trialDays !== null && billing.trialEndsAt && ` · trial ends ${fmtDate(billing.trialEndsAt)} (${trialDays} day${trialDays === 1 ? "" : "s"})`}
          {billing.status === "active" && ` · renews ${fmtDate(billing.periodEnd)}`}
          {!billing.betaFree && billing.status === "comped" && " · no invoice for this team"}
        </p>
        {sp.checkout === "success" && <p className="mt-4 rounded-[10px] border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-3.5 py-2.5 text-[13px] text-go">Subscription started. Stripe will email the receipt; the trial converts automatically when it ends.</p>}
        {sp.checkout === "canceled" && <p className="mt-4 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">Checkout was closed before finishing — nothing was started.</p>}

        <div className="mt-6 grid grid-cols-2 gap-7">
          <div>
            <section className="rounded-xl border border-line bg-row px-5 py-[18px]">
              <div className="flex items-baseline"><h3 className="m-0 font-display text-[18px] font-medium text-txt">Usage this period</h3><span className="ml-auto font-mono text-[10.5px] text-faint">{fmtDate(billing.periodStart)} – {fmtDate(billing.periodEnd)}</span></div>
              <div className="mt-3">
                <Counter label="seats" value={billing.usage.seatsUsed} of={billing.plan.seats} hint={est.extraSeats > 0 ? `${est.extraSeats} extra · ${dollars(billing.plan.extraSeatCents)} each` : "included"} />
                <Counter label="actions today" value={billing.usage.actionsToday} of={billing.plan.actionsPerDay} hint={billing.usage.actionsToday >= billing.plan.actionsPerDay ? (billing.betaFree ? "allowance used — resumes 00:00 UTC" : "past the allowance — overage") : "resets 00:00 UTC"} />
                {!billing.betaFree && <Counter label="overage" value={dollars(billing.overageCents)} of={billing.overageLimitCents === null ? "no limit" : dollars(billing.overageLimitCents)} hint={`${billing.usage.overageActions} actions · ${dollars(billing.plan.extraActionCents)} each`} tone={billing.overageExhausted ? "stop" : undefined} />}
              </div>
              {billing.overageExhausted && <p className="mt-3 text-[12.5px] leading-[1.6] text-stop">Overage limit reached — reviews, journals and digests pause until the period ends. Raise the limit or upgrade.</p>}
              {isAdmin && billing.overageLimitCents !== null && (
                <form action={setOverageLimit} className="mt-3 border-t border-line pt-3">
                  <DeskNext />
                  <div className="font-mono text-[10.5px] uppercase tracking-[.08em] text-faint">Overage limit · USD per period</div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Field name="limit" defaultValue={String(billing.overageLimitCents / 100)} mono className="w-24" />
                    <Button tone="ghost">Save</Button>
                    <span className="text-[11px] text-muted">0 pauses at the daily allowance</span>
                  </div>
                </form>
              )}
            </section>

            <Section title="Your invoice, if the period closed now">
              {billing.betaFree ? (
                <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">Nothing — DevBrain is free while the beta runs. Your team keeps {billing.plan.actionsPerDay} AI actions a day and unlimited seats, repos and teammates. You&apos;ll hear from us before that changes, and nothing starts charging on its own.</p>
              ) : billing.status === "comped" ? (
                <p className="mt-2 text-[12.5px] text-muted">Complimentary — nothing is billed.</p>
              ) : (
                <div className="mt-2.5 text-[13px]">
                  <Row k={`${billing.plan.name} plan`} v={dollars(est.planCents)} />
                  <Row k={`${est.extraSeats} extra seat${est.extraSeats === 1 ? "" : "s"}`} v={dollars(est.extraSeatCents)} />
                  <Row k={`${est.overageActions} extra action${est.overageActions === 1 ? "" : "s"}`} v={dollars(est.overageCents)} />
                  <Row k="Total" v={dollars(est.totalCents)} strong />
                  {savings > 0 && <p className="mt-2 text-[12.5px] leading-[1.6] text-accent">On Scale this same month would cost about {dollars(est.totalCents - savings)} — {dollars(savings)} less.</p>}
                </div>
              )}
            </Section>
          </div>

          <div>
            <Section className="" title="Plans" hint={billing.betaFree ? "after the beta" : "per team · 7-day trial"}>
              <div className="mt-2.5 grid gap-3">
                {(["base", "scale"] as const).map((id) => {
                  const p = PLANS[id];
                  const current = billing.plan.id === id && billing.status !== "comped";
                  return (
                    <div key={id} className={`rounded-xl border px-4 py-3.5 ${current ? "border-coralline bg-coralink" : "border-line bg-row"}`}>
                      <div className="flex items-baseline gap-2"><span className="font-display text-[17px] font-medium text-txt">{p.name}</span><span className="font-mono text-[11px] text-muted">{dollars(p.priceCents)} / month</span>{current && <span className="ml-auto font-mono text-[10.5px] text-accent">current</span>}</div>
                      <ul className="mt-2 grid gap-1 text-[12.5px] text-body">
                        <li>{p.seats} seats included, then {dollars(p.extraSeatCents)} each per month</li>
                        <li>{p.actionsPerDay} AI actions a day, then {dollars(p.extraActionCents)} each</li>
                        <li>Unlimited repos and teammates</li>
                      </ul>
                    </div>
                  );
                })}
              </div>
              {billing.status !== "comped" && <BillingButtons plan={billing.plan.id} hasSubscription={billing.hasSubscription} canManage={isAdmin} />}
              {billing.betaFree && <p className="mt-3 text-[12.5px] leading-[1.6] text-muted">These are the plans DevBrain will charge for when the beta ends. Nothing to do now — there is no card on file and no trial counting down.</p>}
              <p className="mt-3 text-[11.5px] leading-[1.6] text-faint">A seat is any identity with a session in the period — a person on Claude Code or Cursor, or a spawned agent session. Extra seats and actions are metered on the same invoice; nothing is blocked mid-month.</p>
            </Section>
          </div>
        </div>
      </Reading>
    </>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return <div className={`flex items-baseline justify-between border-t border-line py-1.5 ${strong ? "font-medium text-txt" : "text-body"}`}><span>{k}</span><span className="font-mono text-[12.5px]">{v}</span></div>;
}

/** The whole Console when a team isn't entitled: the reason, the two plans,
 *  and the buttons. Rendered by the layout in place of any page. */
export function PlanWall({ billing, isAdmin }: { billing: BillingSnapshot; isAdmin: boolean }) {
  const reason = wallReason({ status: billing.status, hasSubscription: billing.hasSubscription, trialEndsAt: billing.trialEndsAt, periodEnd: billing.periodEnd });
  const copy = WALL_COPY[reason ?? "never_subscribed"];
  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-10">
      <div className="mx-auto max-w-[720px]">
        <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-accent">Plan</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-[-.02em] text-txt">{copy.title}</h1>
        <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">{copy.body}</p>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {(["base", "scale"] as const).map((id) => {
            const p = PLANS[id];
            return (
              <div key={id} className="rounded-xl border border-line bg-row px-4 py-3.5">
                <div className="flex items-baseline gap-2"><span className="font-display text-[17px] font-medium text-txt">{p.name}</span><span className="font-mono text-[11px] text-muted">{dollars(p.priceCents)} / month</span></div>
                <ul className="mt-2 grid gap-1 text-[12.5px] text-body">
                  <li>{p.seats} seats included, then {dollars(p.extraSeatCents)} each</li>
                  <li>{p.actionsPerDay} AI actions a day, then {dollars(p.extraActionCents)} each</li>
                  <li>Unlimited repos and teammates</li>
                </ul>
              </div>
            );
          })}
        </div>
        <BillingButtons plan={billing.plan.id} hasSubscription={billing.hasSubscription} canManage={isAdmin} />
        {!isAdmin && <p className="mt-3 text-[12.5px] text-muted">Ask a team admin to pick a plan — you'll be in as soon as they do.</p>}
        <p className="mt-6 text-[11.5px] leading-[1.6] text-faint">Presence, tasks, handoffs and the brain are all kept. The Console and the panel open again the moment Checkout completes.</p>
      </div>
    </main>
  );
}
