import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { writerConfigured } from "@/lib/github-writer";
import { FEATURE_CATALOG, RULES_CATALOG as CATALOG, WRITER_CATALOG } from "@/lib/rules-catalog";
import { supabaseServer } from "@/lib/supabase/server";
import { toggleRule } from "./actions";
import { deleteRepo, unlinkRepo } from "../unlink-actions";
import { connectWriter } from "./writer-actions";

export const dynamic = "force-dynamic";

// Team rules per repo. DevBrain is the source of truth agents read; GitHub
// branch protection is the enforcement layer humans click on (Documentarian
// mode keeps DevBrain write-free). Each rule shows a deep link to enforce it.

export default async function RulesPage({
  params,
}: {
  params: Promise<{ repoId: string }>;
}) {
  const { repoId } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const { data: repo } = await supabase
    .from("linked_repos")
    .select("id, full_name, writer_installation_id, installation_id, unlinked_at")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

  const writerReady = writerConfigured();
  const writerSlug = process.env.NEXT_PUBLIC_GHW_APP_SLUG || "";

  const { data: rows } = await supabase
    .from("policies")
    .select("rule, enabled")
    .eq("repo_id", repo.id);
  const state = new Map((rows ?? []).map((r) => [r.rule, r.enabled]));

  return (
    <>
      <AppNav
        tabs={[
          { label: "Overview", href: `/dashboard/${repo.id}` },
          { label: "Tasks", href: `/dashboard/${repo.id}/tasks` },
          { label: "Specs", href: `/dashboard/${repo.id}/specs` },
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
          { label: "History", href: `/dashboard/${repo.id}/history` },
          { label: "Rules", href: `/dashboard/${repo.id}/rules`, active: true },
        ]}
      />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <div className="mb-1 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">Team rules</h1>
          <span className="text-sm text-slate-500">{repo.full_name}</span>
        </div>
        <p className="mb-5 max-w-2xl text-sm text-slate-500">
          Rules toggled on are served to every Claude via the plugin — agents
          follow them automatically. Rules with a GitHub link are also
          enforceable at the merge button via branch protection (a human clicks
          that on; DevBrain never holds write access).
        </p>

        <section className="card">
          <ul className="divide-y divide-slate-100">
            {CATALOG.map((c) => {
              const on = state.get(c.rule) ?? true; // default: all rules on
              return (
                <li key={c.rule} className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium text-slate-900">{c.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.detail}</div>
                    {c.ghPath && (
                      <a
                        href={`https://github.com/${repo.full_name}/${c.ghPath}`}
                        target="_blank"
                        className="mt-1 inline-block text-xs font-medium text-brand-600 hover:underline"
                      >
                        Enforce on GitHub
                      </a>
                    )}
                  </div>
                  <form action={toggleRule}>
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="rule" value={c.rule} />
                    <input type="hidden" name="enabled" value={String(!on)} />
                    <button
                      className={
                        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors " +
                        (on ? "bg-brand-600" : "bg-slate-200")
                      }
                      aria-label={on ? "Turn off" : "Turn on"}
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                          (on ? "translate-x-6" : "translate-x-1")
                        }
                      />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card mt-6">
          <div className="border-b border-slate-100 p-4">
            <h2 className="font-semibold text-slate-900">Features</h2>
            <p className="mt-0.5 text-xs text-slate-500">Off by default. Turn on per repo; takes effect on the next session end.</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {FEATURE_CATALOG.map((c) => {
              const on = state.get(c.rule) ?? false;
              return (
                <li key={c.rule} className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium text-slate-900">{c.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.detail}</div>
                  </div>
                  <form action={toggleRule}>
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="rule" value={c.rule} />
                    <input type="hidden" name="enabled" value={String(!on)} />
                    <button
                      className={
                        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors " +
                        (on ? "bg-brand-600" : "bg-slate-200")
                      }
                      aria-label={on ? "Turn off" : "Turn on"}
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                          (on ? "translate-x-6" : "translate-x-1")
                        }
                      />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Direction 2 — writer app (scoped writes, PR-only, default off) */}
        <section className="card mt-6">
          <div className="border-b border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-slate-900">Write features (Copilot mode)</h2>
                <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
                  Powered by a separate writer app with its own credentials.
                  Every write it makes is a branch + pull request reviewed under
                  the team rules above — it can never push to {`main`} directly.
                  Each feature is off until you turn it on here.
                </p>
              </div>
              <span
                className={
                  "chip flex-shrink-0 " +
                  (repo.writer_installation_id
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500")
                }
              >
                {repo.writer_installation_id ? "writer connected" : "not connected"}
              </span>
            </div>
            {!writerReady ? (
              <p className="mt-2 text-xs text-amber-700">
                Writer app not configured on the server yet — set{" "}
                <code className="rounded bg-slate-100 px-1">DEVBRAIN_GHW_APP_ID</code> and{" "}
                <code className="rounded bg-slate-100 px-1">DEVBRAIN_GHW_PRIVATE_KEY</code> in Vercel.
              </p>
            ) : (
              <div className="mt-2 flex items-center gap-3 text-xs">
                {writerSlug && (
                  <a
                    href={`https://github.com/apps/${writerSlug}/installations/new`}
                    target="_blank"
                    className="rounded-md border border-slate-300 px-2.5 py-1 text-slate-700 hover:bg-slate-50"
                  >
                    Install writer app on GitHub
                  </a>
                )}
                <form action={connectWriter}>
                  <input type="hidden" name="repoId" value={repo.id} />
                  <button className="rounded-md bg-brand-600 px-2.5 py-1 font-medium text-white hover:bg-brand-700">
                    {repo.writer_installation_id ? "Re-check connection" : "Connect"}
                  </button>
                </form>
              </div>
            )}
          </div>
          <ul className="divide-y divide-slate-100">
            {WRITER_CATALOG.map((c) => {
              const on = (state.get(c.rule) ?? false) && Boolean(repo.writer_installation_id);
              const usable = writerReady && Boolean(repo.writer_installation_id);
              return (
                <li key={c.rule} className="flex items-start justify-between gap-4 p-4">
                  <div>
                    <div className="font-medium text-slate-900">{c.label}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-slate-500">{c.detail}</div>
                  </div>
                  <form action={toggleRule}>
                    <input type="hidden" name="repoId" value={repo.id} />
                    <input type="hidden" name="rule" value={c.rule} />
                    <input type="hidden" name="enabled" value={String(!(state.get(c.rule) ?? false))} />
                    <button
                      disabled={!usable}
                      className={
                        "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors " +
                        (on ? "bg-brand-600" : "bg-slate-200") +
                        (usable ? "" : " cursor-not-allowed opacity-50")
                      }
                      aria-label={on ? "Turn off" : "Turn on"}
                    >
                      <span
                        className={
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform " +
                          (on ? "translate-x-6" : "translate-x-1")
                        }
                      />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card mt-6 border-red-100">
          <div className="border-b border-slate-100 p-4">
            <h2 className="font-semibold text-slate-900">Unlink this repository</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Unlinking removes <span className="font-mono">{repo.full_name}</span> from DevBrain&apos;s dashboards, widget and agent context.
              Your Claude sessions in it stop reporting. GitHub access is separate — to also revoke the app&apos;s access,{" "}
              <a className="text-brand-700 underline" href={`https://github.com/settings/installations/${repo.installation_id}`} target="_blank" rel="noreferrer">
                edit the installation on GitHub
              </a>.
            </p>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <form action={unlinkRepo} className="rounded-md border border-slate-200 p-3">
              <input type="hidden" name="repoId" value={repo.id} />
              <div className="font-medium text-slate-900">Unlink, keep history</div>
              <p className="mt-0.5 mb-3 text-xs text-slate-500">
                Tasks, journals, PR reviews and the brain index stay. Reinstalling the GitHub App on this repo links it again with everything intact.
              </p>
              <button className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:border-slate-400">Unlink</button>
            </form>
            <form action={deleteRepo} className="rounded-md border border-red-200 bg-red-50/40 p-3">
              <input type="hidden" name="repoId" value={repo.id} />
              <div className="font-medium text-red-800">Unlink and delete everything</div>
              <p className="mt-0.5 mb-2 text-xs text-slate-600">
                Permanently deletes every task, journal, handoff, PR record and index entry for this repo. Type the full name to confirm.
              </p>
              <input name="confirm" placeholder={repo.full_name} className="mb-2 w-full rounded-md border border-red-200 bg-white px-2 py-1.5 font-mono text-xs focus:border-red-400 focus:outline-none" />
              <button className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700">Delete</button>
            </form>
          </div>
        </section>
      </main>
    </>
  );
}
