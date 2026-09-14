import type { Metadata } from "next";
import Link from "next/link";
import { BrowserShell } from "@/app/browser-shell";
import { MotionGate, Mount, Reveal } from "@/app/landing/reveal";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { siteDisplay } from "@/app/fonts";
import { AutoDownload } from "./auto-download";

// /start: where the Download button lands. With ?dl=1 the page starts the
// DMG download itself; either way it shows the five things to do next. The
// app is menu-bar only, so without this page a first launch looks like
// nothing happened.

export const metadata: Metadata = { title: "Start", description: "What to do after downloading DevBrain: install it, sign in with GitHub, link a repo." };
// Reading searchParams makes this page dynamic. Do not add force-static: it
// would make searchParams empty and ?dl=1 would never start the download.

export const START_STEPS = [
  { title: "Open the DMG", body: "It is in your Downloads folder, named DevBrain.dmg. If the download did not start, use the button below." },
  { title: "Drag DevBrain into Applications", body: "Then eject the DMG. You can delete it afterwards." },
  { title: "Open DevBrain from Applications", body: "It lives in the menu bar and has no Dock icon. The panel opens from the bottom corner of the screen when your mouse reaches it." },
  { title: "Sign in with GitHub", body: "The panel opens a browser tab for sign-in and hands you straight back to the app. Signing in does not give DevBrain access to any code." },
  { title: "Link a repository", body: "Pick one repo to start with and choose its rules. The next time anyone on the team opens a session there, it will know who else is around." },
] as const;

export function StartBody({ dl }: { dl: boolean }) {
  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <AutoDownload enabled={dl} />
        <SiteHeader />
        <section className="mx-auto w-full max-w-[720px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="p" className="font-mono text-[12px] uppercase tracking-[.12em] text-muted">{dl ? "Your download is starting" : "After the download"}</Mount>
          <Mount as="h1" delay={60} duration={700} y={24} className="mt-3 max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Five steps, about five minutes.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">DevBrain is a small Mac app. Once it is running and linked to a repo, every coding session on the team sees the same picture.</Mount>
          <ol className="mt-12 space-y-0">
            {START_STEPS.map((s, i) => (
              <Reveal key={s.title} as="li" delay={i * 70} y={12} duration={500} className="grid grid-cols-[44px_1fr] gap-x-4 border-t border-line2 py-6">
                <span className="font-mono text-[13px] tabular-nums text-accenttext">0{i + 1}</span>
                <div>
                  <h2 className="font-display text-[21px] font-medium leading-[1.2] tracking-[-.015em] text-txt">{s.title}</h2>
                  <p className="mt-2 max-w-[50ch] text-[14.5px] leading-[1.65] text-body">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
          <Reveal delay={420} y={12} duration={500} className="mt-10 flex flex-wrap items-center gap-4 border-t border-line2 pt-8">
            <a href="/download" className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-[10px] border border-line2 bg-row px-5 py-3 font-display text-[15px] font-semibold text-txt hover:border-line">Download again</a>
            <span className="text-[13.5px] text-muted">Stuck? Write to us at team@getdevbrain.com, or read the <Link href="/faq" className="text-accenttext hover:underline">FAQ</Link>.</span>
          </Reveal>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}

export default async function StartPage({ searchParams }: { searchParams: Promise<{ dl?: string }> }) {
  const { dl } = await searchParams;
  return <StartBody dl={dl === "1"} />;
}
