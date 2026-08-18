import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { createToken, revokeToken } from "./actions";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: tokens } = await supabase
    .from("dev_tokens")
    .select("id, label, created_at, revoked_at")
    .order("created_at", { ascending: false });

  const newToken = (await cookies()).get("devbrain_new_token")?.value;

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Dev tokens</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          A token connects your machine&apos;s hooks (and your Claude) to
          DevBrain. One per machine is a good habit.
        </p>

        {newToken && (
          <div className="card mb-6 border-brand-200 bg-brand-50/50 card-pad">
            <p className="mb-2 text-sm font-semibold text-brand-700">
              Your new token — copy it now, it is shown exactly once:
            </p>
            <code className="block select-all break-all rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-800">
              {newToken}
            </code>
            <p className="mt-2 text-xs text-slate-500">
              Use it in <code className="rounded bg-slate-100 px-1">devbrain init</code> on
              your machine.
            </p>
          </div>
        )}

        <section className="card mb-6 card-pad">
          <form action={createToken} className="flex gap-2">
            <input
              name="label"
              placeholder="Label (e.g. lukes-macbook)"
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Create token
            </button>
          </form>
        </section>

        <section className="card card-pad">
          <h2 className="card-title mb-3">Your tokens</h2>
          {!tokens || tokens.length === 0 ? (
            <p className="text-sm text-slate-500">No tokens yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {tokens.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <span className={t.revoked_at ? "text-slate-400 line-through" : "text-slate-800"}>
                      {t.label}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      created {new Date(t.created_at).toLocaleDateString()}
                      {t.revoked_at ? " · revoked" : ""}
                    </span>
                  </div>
                  {!t.revoked_at && (
                    <form action={revokeToken}>
                      <input type="hidden" name="id" value={t.id} />
                      <button className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                        Revoke
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
