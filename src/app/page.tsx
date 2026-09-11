import { redirect } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "./browser-shell";
import { SignInButton } from "./sign-in-button";

// The landing (Dusk): mark, wordmark 52/500, one display-face paragraph, the
// GitHub sign-in, Privacy / Terms. Signed in → /open.

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; next?: string; auth_error?: string; device_error?: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/open");
  const { from, next, auth_error, device_error } = await searchParams;
  // Only same-origin paths may be used as a post-login destination.
  const nextParam = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const inPanel = from === "widget";

  return (
    <BrowserShell>
      <main className={inPanel ? "flex min-h-screen flex-col items-center justify-center px-6 text-center" : "mx-auto flex min-h-screen max-w-[600px] flex-col justify-center px-14 py-14"}>
        {(auth_error || device_error) && (
          <p className="mb-6 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">
            {device_error
              ? `The desktop sign-in link was ${device_error}. Click Sign in again in the DevBrain panel.`
              : "Sign-in didn't complete — the GitHub hand-off was rejected or expired. Try again."}
          </p>
        )}
        {inPanel ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brain.png" width={49} height={40} alt="" />
            <div className="mt-3 font-display text-[17px] font-bold tracking-[-.02em] text-txt">DevBrain</div>
            <p className="mb-3.5 mt-1.5 max-w-[260px] text-[12.5px] leading-[1.5] text-muted">Sign in with GitHub in your browser — the app picks it up and comes back here.</p>
            <SignInButton next="/widget" size="sm" />
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brain.png" width={69} height={56} alt="" />
            <h1 className="mt-[22px] font-display text-[52px] font-medium leading-none tracking-[-.03em] text-txt">DevBrain</h1>
            <p className="mt-3.5 max-w-[440px] font-display text-[19px] leading-[1.5] text-body">A shared second brain for your team and your coding agents. Live presence, PRs, collision warnings, memory, and restore points — for any GitHub repo.</p>
            <div className="mt-7 flex items-center gap-4">
              <SignInButton next={nextParam || (from === "desk" ? "/desk" : undefined)} />
              <span className="max-w-[260px] text-[12px] leading-[1.5] text-muted">Create or join a team, link a repo, install the Mac app — that&apos;s the whole setup.</span>
            </div>
            <footer className="mt-14 flex gap-4 text-[12px] text-faint">
              <Link href="/pricing" className="hover:text-txt">Pricing</Link>
              <Link href="/privacy" className="hover:text-txt">Privacy</Link>
              <Link href="/terms" className="hover:text-txt">Terms</Link>
            </footer>
          </>
        )}
      </main>
    </BrowserShell>
  );
}
