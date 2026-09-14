import { Dot } from "./app-shots";
import { DownloadButton } from "./download-button";
import { EmailForm } from "./email-form";
import { Reveal } from "./reveal";

export function DownloadCard({ spotsLeft, maxTeams, full, emailForm = true }: { spotsLeft: number | null; maxTeams: number | null; full: boolean; emailForm?: boolean }) {
  return (
    <Reveal amount={0.3} y={24} duration={700} className="rounded-2xl border border-line2 bg-row px-6 py-8 sm:px-11 sm:py-12">
      {full ? (
        <>
          <Reveal as="h2" delay={70} y={10} duration={500} className="max-w-[20ch] font-display text-[26px] font-medium leading-[1.08] tracking-[-.028em] text-txt sm:text-[38px]">The beta is full. Get the next place.</Reveal>
          <Reveal as="p" delay={140} y={10} duration={500} className="mt-4 max-w-[54ch] text-[16.5px] leading-[1.6] text-body">All {maxTeams} places are taken. Leave an address and you&apos;ll hear when one opens.</Reveal>
          <EmailForm source="beta_full" className="mt-7 max-w-[440px]" />
        </>
      ) : (
        <>
          <Reveal as="h2" delay={70} y={10} duration={500} className="max-w-[20ch] font-display text-[26px] font-medium leading-[1.08] tracking-[-.028em] text-txt sm:text-[38px]">Try it on one repo.</Reveal>
          <Reveal as="p" delay={140} y={10} duration={500} className="mt-4 max-w-[54ch] text-[16.5px] leading-[1.6] text-body">Download it, sign in with GitHub, pick a repo. It takes about five minutes. The next time anyone on the team opens a session, it will know who else is there.</Reveal>
          <Reveal delay={210} y={10} duration={500} className="mt-7 flex flex-wrap items-center gap-4">
            <DownloadButton size="card" />
            {spotsLeft !== null && (
              <span className="inline-flex items-center gap-2.5 text-[13px] text-muted"><Dot tone="go" /><span className="font-mono text-[13px] font-medium tabular-nums text-txt">{spotsLeft}</span>beta spots left · free until the beta ends</span>
            )}
          </Reveal>
          <Reveal as="p" delay={280} y={10} duration={500} className="mt-3 text-[13px] text-muted">Signing in doesn&apos;t give DevBrain access to your code. You pick the repo yourself, after.</Reveal>
          {emailForm && (
            <Reveal delay={350} y={10} duration={500} className="mt-9 border-t border-line pt-6">
              <p className="text-[13.5px] text-muted">Not on a Mac, or not ready yet? Leave your email and we&apos;ll let you know.</p>
              <EmailForm className="mt-4 max-w-[440px]" />
            </Reveal>
          )}
        </>
      )}
    </Reveal>
  );
}
