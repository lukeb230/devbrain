import { redirect } from "next/navigation";
import Link from "next/link";
import { BrainMark } from "@/components/BrainMark";
import { supabaseServer } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; next?: string; auth_error?: string; device_error?: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const { from, next, auth_error, device_error } = await searchParams;
  // Only same-origin paths may be used as a post-login destination.
  const nextParam = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      {(auth_error || device_error) && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          {device_error
            ? `The desktop sign-in link was ${device_error}. Click Sign in again in the DevBrain panel.`
            : "Sign-in didn't complete — the GitHub hand-off was rejected or expired. Try again."}
        </p>
      )}
      <div>
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
          D
        </div>
        <BrainMark size={64} id="signin" className="mb-3 text-brand-600" title="DevBrain" />
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          DevBrain
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          A shared second brain for your team and your coding agents. Live
          presence, PRs, collision warnings, memory, and restore points — for
          any GitHub repo.
        </p>
      </div>
      <SignInButton next={nextParam || (from === "widget" ? "/widget" : undefined)} />
      <p className="text-xs text-slate-500">
        Sign in with GitHub, create or join a team, link a repo, and install the
        Mac app — that&apos;s the whole setup.
      </p>
      <footer className="mt-4 flex gap-4 text-xs text-slate-400">
        <Link href="/privacy" className="hover:text-slate-600 hover:underline">Privacy</Link>
        <Link href="/terms" className="hover:text-slate-600 hover:underline">Terms</Link>
      </footer>
    </main>
  );
}
