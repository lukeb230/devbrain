import { redirect } from "next/navigation";
import { BrainMark } from "@/components/BrainMark";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { createTeam, useInvite } from "./actions";

export const dynamic = "force-dynamic";

// Landing for a signed-in user with no team yet. Also where a bad invite
// link ends up, with the reason.

export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ invite_error?: string }> }) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const { invite_error } = await searchParams;
  const ctx = await currentOrg();
  const m = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "there");

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div className="text-center">
        <BrainMark size={48} id="welcome" className="mx-auto mb-3 text-brand-600" title="DevBrain" />
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Hi {login}</h1>
        <p className="mt-2 text-slate-600">
          {ctx ? "Create another team, or join one with an invite link." : "You're signed in. Now you need a team — create one, or join with an invite link from a teammate."}
        </p>
      </div>

      {invite_error && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-800">{invite_error}</p>
      )}

      <section className="card card-pad">
        <h2 className="font-semibold text-slate-900">Create a team</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">You&apos;ll be its owner. Link repos and invite people next.</p>
        <form action={createTeam} className="flex gap-2">
          <input name="name" required maxLength={60} placeholder="Team name" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Create team</button>
        </form>
      </section>

      <section className="card card-pad">
        <h2 className="font-semibold text-slate-900">Join with an invite</h2>
        <p className="mb-3 mt-1 text-sm text-slate-500">Paste the link a teammate sent you.</p>
        <form action={useInvite} className="flex gap-2">
          <input name="invite" required placeholder="https://…/join/…" className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
          <button className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Join</button>
        </form>
      </section>

      {ctx && (
        <p className="text-center text-sm text-slate-500">
          <a href="/dashboard" className="text-brand-600 hover:underline">Back to {ctx.orgName}</a>
        </p>
      )}
      <form action="/auth/sign-out" method="post" className="text-center">
        <button className="text-xs text-slate-400 hover:text-slate-700">Sign out</button>
      </form>
    </main>
  );
}
