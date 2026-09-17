// src/app/account/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrowserShell } from "@/app/browser-shell";
import { siteDisplay } from "@/app/fonts";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { MotionGate, Mount } from "@/app/landing/reveal";
import { loadBilling } from "@/lib/billing/usage";
import { standingsFor } from "@/lib/membership";
import { currentOrg, hasRole, loginOf } from "@/lib/org";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";
import { AccountBody, type AccountTeam } from "./account-body";

export const metadata: Metadata = { title: "Account", description: "Your DevBrain account: teams, devices, sign out, delete." };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/?next=/account");
  const login = loginOf(user);
  const ctx = await currentOrg(); // null when they have no team yet
  const admin = supabaseAdmin();

  const standings = ctx ? await standingsFor(admin, ctx.orgs) : [];
  const teams: AccountTeam[] = await Promise.all(standings.map(async (s) => {
    const admin_ = hasRole(s.role, "admin");
    // One team's billing lookup failing (a Stripe hiccup, a missing row)
    // must not take the whole page down — that team just renders without
    // a plan line.
    const b = admin_ ? await loadBilling(s.orgId).catch(() => null) : null;
    return { ...s, active: ctx?.orgId === s.orgId, plan: b ? { name: b.plan.name, status: b.status, betaFree: b.betaFree } : null };
  }));

  const { data: tokens } = await admin
    .from("dev_tokens")
    .select("id, label, last_used_at, org_id, orgs(name)")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .is("parent_token_id", null)
    .order("last_used_at", { ascending: false, nullsFirst: false });
  const devices = (tokens ?? []).map((t) => ({ id: String(t.id), label: String(t.label), team: ((t.orgs as unknown as { name: string } | null)?.name) ?? "team", lastUsedAt: (t.last_used_at as string | null) ?? null }));

  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader current="account" account={{ login }} />
        <section className="mx-auto w-full max-w-[1140px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="h1" duration={700} y={24} className="max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Your account.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">Everything about you that lives in DevBrain, and the way out. The work itself happens in the app.</Mount>
          <Mount delay={250} className="mt-12 max-w-[760px]"><AccountBody login={login} email={user.email} teams={teams} devices={devices} /></Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
