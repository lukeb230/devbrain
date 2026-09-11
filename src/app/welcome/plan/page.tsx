import { redirect } from "next/navigation";
import { PlanPicker } from "@/app/billing/plan-picker";
import { loadBilling } from "@/lib/billing/usage";
import { wallReason } from "@/lib/billing/wall";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "../../browser-shell";

// ============================================================================
// /welcome/plan — step two of creating a team: pick a plan and start the
// trial. Subscription before download: a team only reaches /open's download
// once Stripe has confirmed the subscription.
// ============================================================================

export const dynamic = "force-dynamic";

export default async function WelcomePlan({ searchParams }: { searchParams: Promise<{ checkout?: string; billing_error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const billing = await loadBilling(org.orgId);
  const walled = billing ? wallReason({ status: billing.status, hasSubscription: billing.hasSubscription, trialEndsAt: billing.trialEndsAt, periodEnd: billing.periodEnd }) : null;
  if (!walled) redirect("/open?created=1");

  return (
    <BrowserShell>
      <main className="mx-auto flex min-h-screen max-w-[640px] flex-col justify-center px-8 py-11">
        <div className="font-mono text-[10.5px] uppercase tracking-[.14em] text-accent">Step 2 of 2</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-[-.02em] text-txt">Start {org.orgName}&apos;s trial</h1>
        <p className="mt-2 max-w-[56ch] text-[13.5px] leading-[1.6] text-muted">Seven days free with a card on file. The download and the app unlock the moment Checkout completes; teammates you invite never see this step.</p>
        {sp.checkout === "canceled" && <p className="mt-4 text-[13px] text-wait">Checkout was closed before finishing — pick a plan to try again.</p>}
        <div className="mt-6"><PlanPicker back="/welcome/plan" canBuy={hasRole(org.role, "admin")} error={sp.billing_error} /></div>
      </main>
    </BrowserShell>
  );
}
