import { FONT_VARS } from "@/app/fonts";
import { createTeam, useInvite } from "@/app/welcome/actions";
import { TeamForms } from "@/app/welcome/team-forms";

// Mounted by desk/layout.tsx INSTEAD of the Desk when the signed-in person is
// on no team yet: step zero of the walkthrough, in the app. The forms return
// to /desk (createTeam and useInvite honour next=/desk), and the layout then
// renders the onboarding wall for the new team.
export function TeamWall({ login, full }: { login: string; full: string | null }) {
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="dark"||t==="system")document.documentElement.dataset.wgTheme=t;}catch(e){}`;
  return (
    <div className={`wg ${FONT_VARS} font-body flex h-screen flex-col bg-ink text-[13.5px] text-txt`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      <div data-tauri-drag-region className="h-[34px] flex-shrink-0 bg-row" />
      <main className="mx-auto flex w-full max-w-[520px] flex-1 flex-col justify-center px-11 pb-16">
        <div className="font-mono text-[10px] uppercase tracking-[.12em] text-muted">Step 1 of 5</div>
        <h1 className="mt-2 font-display text-[32px] font-medium tracking-[-.02em] text-txt">Hi {login}</h1>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">You&apos;re signed in. Now you need a team — create one, or join with an invite link from a teammate. Linking a repository and setting up this Mac come next, right here.</p>
        <TeamForms appNext="/desk" full={full} compact={false} createAction={createTeam} joinAction={useInvite} />
        <form action="/auth/sign-out" method="post" className="mt-8 text-[12px] text-faint">
          <input type="hidden" name="from" value="desk" />
          <button className="hover:text-txt">Sign out</button>
        </form>
      </main>
    </div>
  );
}
