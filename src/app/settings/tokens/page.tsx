import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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
    <main className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-8">
        <Link href="/dashboard" className="text-sm text-slate-400 hover:text-white">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Dev tokens</h1>
        <p className="text-sm text-slate-500">
          A token connects your machine&apos;s hooks (and your Claude) to
          DevBrain. One per machine is a good habit.
        </p>
      </header>

      {newToken && (
        <div className="panel mb-6 border-brand-500/50">
          <p className="mb-2 text-sm font-semibold text-brand-400">
            Your new token — copy it now, it is shown exactly once:
          </p>
          <code className="block select-all break-all rounded bg-ink-800 p-3 text-sm text-slate-200">
            {newToken}
          </code>
          <p className="mt-2 text-xs text-slate-500">
            Use it in <code className="rounded bg-ink-800 px-1">devbrain init</code> on
            your machine.
          </p>
        </div>
      )}

      <section className="panel mb-6">
        <form action={createToken} className="flex gap-2">
          <input
            name="label"
            placeholder="Label (e.g. lukes-macbook)"
            className="flex-1 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-500"
          >
            Create token
          </button>
        </form>
      </section>

      <section className="panel">
        <h2 className="mb-3 text-lg font-semibold text-white">Your tokens</h2>
        {!tokens || tokens.length === 0 ? (
          <p className="text-sm text-slate-500">No tokens yet.</p>
        ) : (
          <ul className="divide-y divide-ink-700">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <span className={t.revoked_at ? "text-slate-500 line-through" : "text-slate-200"}>
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
                    <button className="rounded border border-red-500/50 px-3 py-1 text-xs text-red-400 hover:bg-red-500/10">
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
  );
}
