import { redirect } from "next/navigation";
import Link from "next/link";
import { AppNav } from "@/components/AppNav";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { addMember, removeMember } from "./actions";

export const dynamic = "force-dynamic";

// Team members + allowlist. Adding someone here replaces the old flow of
// editing DEVBRAIN_ALLOWED_LOGINS in Vercel and redeploying.

export default async function MembersPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const admin = supabaseAdmin();
  const [{ data: invited }, { data: authUsers }, { data: sessions }] = await Promise.all([
    supabase.from("allowed_members").select("login, invited_by, note, created_at").order("created_at"),
    admin.auth.admin.listUsers(),
    admin
      .from("sessions")
      .select("dev_label, last_seen")
      .order("last_seen", { ascending: false })
      .limit(200),
  ]);

  const envLogins = (process.env.DEVBRAIN_ALLOWED_LOGINS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  // Who has actually signed in, and who has ever streamed a session.
  const joined = new Map<string, string>();
  for (const u of authUsers?.users ?? []) {
    const m = (u.user_metadata ?? {}) as Record<string, unknown>;
    const login = String(m.user_name || m.preferred_username || "").toLowerCase();
    if (login) joined.set(login, u.created_at);
  }
  const active = new Set(
    (sessions ?? []).map((s) => String(s.dev_label || "").toLowerCase()),
  );

  const rows = [
    ...new Set([...envLogins, ...(invited ?? []).map((i) => i.login.toLowerCase())]),
  ].sort();

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Team members</h1>
        <p className="mb-5 mt-1 max-w-xl text-sm text-slate-500">
          Anyone listed here can sign in to DevBrain. Adding someone takes
          effect immediately — no Vercel edit, no redeploy. Send them the{" "}
          <Link href="/settings/setup" className="text-brand-600 hover:underline">
            setup page
          </Link>{" "}
          and they can do the rest themselves.
        </p>

        <section className="card mb-6 card-pad">
          <form action={addMember} className="flex flex-wrap gap-2">
            <input
              name="login"
              required
              placeholder="GitHub username (or profile URL)"
              className="min-w-[220px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <input
              name="note"
              placeholder="Note (optional)"
              className="min-w-[160px] flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">
              Add member
            </button>
          </form>
        </section>

        <section className="card">
          <ul className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                No allowlist yet — this instance is open to any GitHub account.
                Add yourself and your teammates to lock it down.
              </li>
            )}
            {rows.map((login) => {
              const inv = (invited ?? []).find((i) => i.login.toLowerCase() === login);
              const fromEnv = envLogins.includes(login);
              const hasJoined = joined.has(login);
              const hasStreamed = active.has(login);
              return (
                <li key={login} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <a
                    href={`https://github.com/${login}`}
                    target="_blank"
                    className="font-medium text-slate-900 hover:text-brand-600"
                  >
                    {login}
                  </a>
                  {hasStreamed ? (
                    <span className="chip bg-emerald-50 text-emerald-700">fully set up</span>
                  ) : hasJoined ? (
                    <span className="chip bg-amber-50 text-amber-700">signed in · machine not connected</span>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-500">invited · not signed in</span>
                  )}
                  {fromEnv && (
                    <span className="chip bg-slate-100 text-slate-400" title="Listed in DEVBRAIN_ALLOWED_LOGINS">
                      from env
                    </span>
                  )}
                  <span className="text-xs text-slate-400">
                    {inv?.invited_by ? `added by ${inv.invited_by}` : ""}
                    {inv?.note ? ` · ${inv.note}` : ""}
                  </span>
                  {!fromEnv && (
                    <form action={removeMember} className="ml-auto">
                      <input type="hidden" name="login" value={login} />
                      <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        {envLogins.length > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            Entries marked <span className="chip bg-slate-100 text-slate-400">from env</span> come from
            the <code className="rounded bg-slate-100 px-1">DEVBRAIN_ALLOWED_LOGINS</code> variable in
            Vercel and can only be removed there. New members added here don&apos;t need it.
          </p>
        )}
      </main>
    </>
  );
}
