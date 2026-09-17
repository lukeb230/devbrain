import type { Metadata } from "next";
import { BrowserShell } from "@/app/browser-shell";
import { siteDisplay } from "@/app/fonts";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { MotionGate, Mount } from "@/app/landing/reveal";
import { LEGAL } from "@/lib/legal";
import { loginOf } from "@/lib/org";
import { currentUser } from "@/lib/supabase/server";
import { SupportForm } from "./support-form";

export const metadata: Metadata = { title: "Support", description: "Ask a question, report a bug, or request a feature. A person reads every one." };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await currentUser();
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader current="support" account={user ? { login: loginOf(user) } : null} />
        <section className="mx-auto w-full max-w-[1140px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="h1" duration={700} y={24} className="max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Ask, report, or request.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">
            Every message goes to the person who builds DevBrain, not a queue. You get a reference number and a copy by email; replies come from {LEGAL.contact}.
          </Mount>
          <Mount delay={250} className="mt-12 max-w-[680px]"><SupportForm email={user?.email ?? null} /></Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
