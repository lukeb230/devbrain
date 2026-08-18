import { notFound, redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { toggleRule } from "./actions";

export const dynamic = "force-dynamic";

// Team rules per repo. DevBrain is the source of truth agents read; GitHub
// branch protection is the enforcement layer humans click on (Documentarian
// mode keeps DevBrain write-free). Each rule shows a deep link to enforce it.

const CATALOG: { rule: string; label: string; detail: string; ghPath?: string }[] = [
  {
    rule: "no_self_approve",
    label: "No approving your own pull request",
    detail: "A teammate must review and approve before merge. Enforce via branch protection: require 1 approving review (GitHub already blocks self-approval).",
    ghPath: "settings/branches",
  },
  {
    rule: "pr_only_main",
    label: "No direct commits to main",
    detail: "All changes reach main through a pull request. Enforce via branch protection: require a PR before merging.",
    ghPath: "settings/branches",
  },
  {
    rule: "no_conflict_pr",
    label: "Never open a PR that conflicts with main",
    detail: "Agents must merge main into their branch and resolve conflicts BEFORE opening a PR. The plugin makes Claudes do this automatically.",
  },
  {
    rule: "brain_updates_required",
    label: "Brain updates ride with behavior changes",
    detail: "A PR that changes how a module works must update the matching .brain/ doc in the same branch.",
  },
  {
    rule: "collision_check",
    label: "Check who's editing before touching a file",
    detail: "The plugin checks DevBrain before every file edit and warns if a teammate's session is active on that file.",
  },
];

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
    .select("id, full_name")
    .eq("id", repoId)
    .single();
  if (!repo) notFound();

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
          { label: "Brain", href: `/dashboard/${repo.id}/brain` },
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
      </main>
    </>
  );
}
