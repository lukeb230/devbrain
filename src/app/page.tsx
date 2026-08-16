import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";

export default async function LandingPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white">
          DevBrain
        </h1>
        <p className="mt-3 text-lg text-slate-400">
          A shared second brain for your team and your coding agents. Live
          presence, PRs, collision warnings, memory, and restore points — for
          any GitHub repo.
        </p>
      </div>
      <SignInButton />
      <p className="text-xs text-slate-500">
        Sign in with GitHub, install the app on a repo, run{" "}
        <code className="rounded bg-ink-800 px-1.5 py-0.5">
          npx devbrain init
        </code>{" "}
        — that&apos;s the whole setup.
      </p>
    </main>
  );
}
