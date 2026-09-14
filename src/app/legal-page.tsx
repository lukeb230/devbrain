import { BrowserShell } from "./browser-shell";
import { MotionGate } from "./landing/reveal";
import { SiteFooter, SiteHeader } from "./landing/landing";
import { siteDisplay } from "./fonts";
import { legalHtml, type LegalDoc } from "@/lib/legal-doc";

// ============================================================================
// /terms and /privacy: the site's header and footer, the page ground, and one
// 720px prose column rendered from the Markdown document. The HTML comes from
// our own files through `marked`; no user content ever passes through here.
// ============================================================================

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const html = legalHtml(doc);
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader />
        <article className="legal mx-auto w-full max-w-[720px] px-6 pt-14 sm:px-8 sm:pt-[70px]" dangerouslySetInnerHTML={{ __html: html }} />
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
