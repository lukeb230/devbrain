import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "./browser-shell";
import { Landing } from "./landing/landing";
import { SignInButton } from "./sign-in-button";

// Two completely different pages behind one route.
//
//   ?from=widget  the 440px desktop panel's sign-in screen. Deliberately bare
//                 — it is a step in the app's own flow, not marketing, and it
//                 must stay that way.
//   otherwise     the public landing page (./landing/landing.tsx), which owns
//                 its own <main> and its own width.
//
// Signed in → /open either way.

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

  const notice =
    auth_error || device_error ? (
      <p className="rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">
        {device_error
          ? `The desktop sign-in link was ${device_error}. Click Sign in again in the DevBrain panel.`
          : "Sign-in didn't complete — the GitHub hand-off was rejected or expired. Try again."}
      </p>
    ) : null;

  if (!inPanel) {
    return (
      <BrowserShell>
        <Landing nextParam={nextParam} from={from} notice={notice} />
      </BrowserShell>
    );
  }

  return (
    <BrowserShell>
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        {notice && <div className="mb-6">{notice}</div>}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={49} height={40} alt="" />
        <div className="mt-3 font-display text-[17px] font-bold tracking-[-.02em] text-txt">DevBrain</div>
        <p className="mb-3.5 mt-1.5 max-w-[260px] text-[12.5px] leading-[1.5] text-muted">Sign in with GitHub in your browser — the app picks it up and comes back here.</p>
        <SignInButton next="/widget" size="sm" />
      </main>
    </BrowserShell>
  );
}
