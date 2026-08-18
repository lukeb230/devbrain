import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { SignInButton } from "./sign-in-button";

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  const { denied } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6 text-center">
      {denied && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This DevBrain is private — your GitHub account isn&apos;t on the team
          allowlist. Ask an admin to add you.
        </p>
      )}
      <div>
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
          D
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-900">
          DevBrain
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          A shared second brain for your team and your coding agents. Live
          presence, PRs, collision warnings, memory, and restore points — for
          any GitHub repo.
        </p>
      </div>
      <SignInButton />
      <p className="text-xs text-slate-500">
        Sign in with GitHub, install the app on a repo, run{" "}
        <code className="rounded bg-slate-100 px-1.5 py-0.5">
          npx devbrain init
        </code>{" "}
        — that&apos;s the whole setup.
      </p>
    </main>
  );
}
