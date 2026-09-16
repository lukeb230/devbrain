import type { Metadata } from "next";
import Link from "next/link";
import { loadBeta, platformCounts } from "@/lib/beta";
import { BrowserShell } from "@/app/browser-shell";
import { DownloadCard } from "@/app/landing/download-card";
import { MotionGate, Mount, Reveal } from "@/app/landing/reveal";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { siteDisplay } from "@/app/fonts";
import { FAQ_ITEMS } from "./faq-items";

export const metadata: Metadata = { title: "FAQ", description: "The questions people ask before they download DevBrain." };
export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const beta = await loadBeta();
  const counts = beta.maxTeams !== null ? await platformCounts() : null;
  const spotsLeft = counts && beta.maxTeams !== null ? Math.max(0, beta.maxTeams - counts.teams) : null;
  const full = spotsLeft === 0;
  const left = FAQ_ITEMS.slice(0, 6);
  const right = FAQ_ITEMS.slice(6);
  const col = (items: typeof FAQ_ITEMS) => items.map((it, i) => (
    <Reveal key={it.q} as="div" delay={i * 60} y={12} duration={500} className="border-t border-line2 pb-6 pt-[22px]">
      <h2 className="max-w-[24ch] font-display text-[21px] font-medium leading-[1.2] tracking-[-.015em] text-txt">{it.q}</h2>
      <div className="mt-2 space-y-2 text-[14.5px] leading-[1.65] text-body [&_p]:max-w-[50ch]">{it.a.map((p, j) => <p key={j}>{p}</p>)}</div>
    </Reveal>
  ));
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader current="faq" />
        <section className="mx-auto w-full max-w-[1140px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="h1" duration={700} y={24} className="max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">The questions people ask before they download.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">Short answers, no marketing. If yours isn&apos;t here, the <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> has the long version of most of them, and the repo is public. Anything else, <Link href="/support" className="text-accenttext hover:underline">ask us</Link>.</Mount>
          <div className="mt-14 grid gap-x-14 md:grid-cols-2"><div>{col(left)}</div><div>{col(right)}</div></div>
          <div className="pt-20"><DownloadCard spotsLeft={spotsLeft} maxTeams={beta.maxTeams} full={full} emailForm={false} /></div>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
