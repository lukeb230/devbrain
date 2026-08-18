import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <Link href={`/dashboard/${repo.id}`} className="text-sm text-slate-400 hover:text-white">
          ← {repo.full_name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Team rules</h1>
        <p className="text-sm text-slate-500">
          Rules toggled ON are served to every Claude via the plugin — agents
          follow them automatically. Rules with a GitHub link are also
          enforceable at the merge button via branch protection (a human clicks
          that on; DevBrain never holds write access).
        </p>
      </header>

      <section className="panel">
        <ul className="divide-y divide-ink-700">
          {CATALOG.map((c) => {
            const on = state.get(c.rule) ?? true; // default: all rules on
            return (
              <li key={c.rule} className="flex items-start justify-between gap-4 py-4">
                <div>
                  <div className="font-medium text-slate-200">{c.label}</div>
                  <div className="mt-0.5 text-xs text-slate-500">{c.detail}</div>
                  {c.ghPath && (
                    <a
                      href={`https://github.com/${repo.full_name}/${c.ghPath}`}
                      target="_blank"
                      className="mt-1 inline-block text-xs text-brand-400 hover:text-brand-500"
                    >
                      Enforce on GitHub →
                    </a>
                  )}
                </div>
                <form action={toggleRule}>
                  <input type="hidden" name="repoId" value={repo.id} />
                  <input type="hidden" name="rule" value={c.rule} />
                  <input type="hidden" name="enabled" value={String(!on)} />
                  <button
                    className={
                      "rounded-full px-3 py-1 text-xs font-semibold " +
                      (on
                        ? "bg-brand-600 text-ink-950"
                        : "border border-ink-700 text-slate-500")
                    }
                  >
                    {on ? "ON" : "off"}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
