import Link from "next/link";
import { BrowserShell } from "./browser-shell";
import { MotionGate, Mount } from "./landing/reveal";
import { SiteFooter, SiteHeader } from "./landing/landing";
import { siteDisplay } from "./fonts";

// The root 404. Next renders it for every route that does not exist, on the
// site and the app surface alike, so it stays static: no session, no DB.

export default function NotFound() {
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader />
        <section className="mx-auto w-full max-w-[720px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="p" className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">404</Mount>
          <Mount as="h1" delay={60} duration={700} y={24} className="mt-3 max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">There is nothing at this address.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">The link may be old, or the page moved. The <Link href="/" className="text-accenttext hover:underline">home page</Link> and the <Link href="/faq" className="text-accenttext hover:underline">FAQ</Link> cover most of what people come here for.</Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
