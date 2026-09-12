import { redirect } from "next/navigation";
import { signupBlock } from "@/lib/beta";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "../browser-shell";
import { createTeam, useInvite } from "./actions";

export const dynamic = "force-dynamic";

// Landing for a signed-in user with no team yet (Dusk) — in the browser, or
// inside the 440px desktop panel (?from=widget: compact layout, forms return
// to /widget). Also where a bad invite link ends up, with the reason.

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ invite_error?: string; from?: string }> }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { invite_error, from } = await searchParams;
  const inPanel = from === "widget";
  const ctx = await currentOrg();
  // Say the beta is full here rather than after someone types a team name.
  const full = await signupBlock("team");
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "there");
  const input = "min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";
  const row = inPanel ? "flex flex-col gap-2" : "flex gap-2";

  return (
    <BrowserShell>
      <main className={inPanel ? "mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-6" : "mx-auto flex min-h-screen max-w-[520px] flex-col justify-center px-11 py-11"}>
        <h1 className={`font-display font-medium tracking-[-.02em] text-txt ${inPanel ? "text-[22px]" : "text-[34px]"}`}>Hi {login}</h1>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">{ctx ? "Create another team, or join one with an invite link." : "You're signed in. Now you need a team — create one, or join with an invite link from a teammate."}</p>

        {invite_error && <p className="mt-4 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">{invite_error}</p>}

        <section className="mt-6 rounded-xl border border-line bg-row p-4">
          <div className="font-display text-[17px] font-medium text-txt">Create a team</div>
          {full ? (
            <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">{full} An invite link from someone already on DevBrain still works.</p>
          ) : (
            <>
              <p className="mb-2.5 mt-1 text-[12.5px] text-muted">You&apos;ll be its owner. Link repos and invite people next.</p>
              <form action={createTeam} className={row}>
                {inPanel && <input type="hidden" name="next" value="/widget" />}
                <input name="name" required maxLength={60} placeholder="Team name" className={input} />
                <button className="whitespace-nowrap rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white">Create team</button>
              </form>
            </>
          )}
        </section>

        <section className="mt-3 rounded-xl border border-line bg-row p-4">
          <div className="font-display text-[17px] font-medium text-txt">Join with an invite</div>
          <p className="mb-2.5 mt-1 text-[12.5px] text-muted">Paste the link a teammate sent you.</p>
          <form action={useInvite} className={row}>
            {inPanel && <input type="hidden" name="next" value="/widget" />}
            <input name="invite" required placeholder="https://…/join/…" className={input} />
            <button className="whitespace-nowrap rounded-lg border border-line2 bg-row px-3.5 py-[9px] text-[12.5px] font-medium text-txt hover:border-line3">Join</button>
          </form>
        </section>

        <div className="mt-8 flex items-center gap-4 text-[12px] text-faint">
          {ctx && <a href={inPanel ? "/widget" : "/open"} className="text-accent hover:underline">Back to {ctx.orgName}</a>}
          <form action="/auth/sign-out" method="post" className="ml-auto"><button className="hover:text-txt">Sign out</button></form>
        </div>
      </main>
    </BrowserShell>
  );
}
