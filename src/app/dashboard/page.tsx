import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: repos } = await supabase
    .from("linked_repos")
    .select("id, full_name, default_branch, is_vault, created_at")
    .order("created_at", { ascending: true });

  const appSlug = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">DevBrain</h1>
        <form action="/auth/sign-out" method="post">
          <button className="text-sm text-slate-400 hover:text-white">
            Sign out
          </button>
        </form>
      </header>

      <section className="panel">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Linked repositories
          </h2>
          <a
            href={installUrl}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-ink-950 hover:bg-brand-500"
          >
            + Link a repository
          </a>
        </div>

        {!repos || repos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink-700 p-8 text-center text-slate-400">
            <p className="font-medium text-slate-300">No repositories linked yet</p>
            <p className="mt-1 text-sm">
              Click &ldquo;Link a repository&rdquo; to install the DevBrain
              GitHub App on your repo. It appears here automatically once the
              installation webhook arrives.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-700">
            {repos.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-3">
                <div>
                  <Link
                    href={`/dashboard/${r.id}`}
                    className="font-medium text-brand-400 hover:text-brand-500"
                  >
                    {r.full_name}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    default: {r.default_branch}
                  </span>
                  {r.is_vault && (
                    <span className="ml-2 rounded bg-ink-800 px-1.5 py-0.5 text-xs text-brand-400">
                      vault
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-500">
        Phase 0 scaffold — presence, PR panels, and the vault wiki land in
        Phases 1–3.
      </p>
    </main>
  );
}
