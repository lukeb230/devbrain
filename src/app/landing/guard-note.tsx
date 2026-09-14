import { Reveal } from "./reveal";
import { TEAM } from "./mock-team";

// The second sentence is the guard's verbatim output (src/lib/guard.ts) and
// must stay word for word, em dash included. The first sentence is the
// guard's real format with the mock team's values.
export function GuardNote({ team = TEAM }: { team?: typeof TEAM }) {
  return (
    <Reveal amount={0.5} y={16} className="lp-interrupt rounded-xl border border-coralline bg-coralink px-5 pb-6 pt-7 sm:px-8">
      <p className="font-mono text-[11.5px] text-accenttext">09:14:07 · what {team.you}&apos;s agent gets back, before it touches the file</p>
      <p className="mt-3 max-w-[40ch] font-display text-[21px] font-medium leading-[1.3] tracking-[-.02em] text-txt sm:text-[26px]">
        <Reveal as="span" fx="fade" delay={250} duration={500}>DevBrain: <code className="font-mono text-[18px] sm:text-[22px]">src/api/auth.ts</code> is being worked on right now by {team.cursor} (claimed: refactoring the session guard). </Reveal>
        <Reveal as="span" fx="fade" delay={470} duration={500}>Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.</Reveal>
      </p>
      <Reveal as="p" fx="fade" delay={800} duration={500} className="mt-4 max-w-[70ch] text-[13.5px] leading-[1.6] text-body">
        Her agent shows her that and waits. DevBrain never decides for you. It just makes sure you get asked. Cursor can&apos;t ask, only refuse, so there the edit is blocked until you tell the agent what to do.
      </Reveal>
    </Reveal>
  );
}
