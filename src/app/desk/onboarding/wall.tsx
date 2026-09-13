import { DeskNext } from "@/app/desk/desk-next";
import { ExternalLink } from "@/app/desk/external-link";
import { toggleRule } from "@/app/dashboard/[repoId]/rules/actions";
import { Switch } from "@/app/desk/ui";
import type { TeamRepo } from "@/lib/desk/repos";
import type { OnboardingState, Step, StepId } from "@/lib/onboarding";
import { hasRole, type OrgContext } from "@/lib/org";
import { FEATURE_CATALOG, RULES_CATALOG, type RuleDef } from "@/lib/rules-catalog";
import { applyPreset, cancelRequest, dismissOnboarding } from "./actions";
import { RefreshWhile } from "./refresh-while";
import { SetupMac } from "./setup-mac";

// ============================================================================
// The first-run walkthrough. Mounted by desk/layout.tsx INSTEAD of children
// for an owner with essentials incomplete (mirrors PlanWall), and by
// /desk/onboarding for anyone. Self-contained: it replaces every Desk route,
// so it may not depend on /desk/team or /desk/mac — the install link, the
// Set up this Mac trigger and the preset action all live here.
// ============================================================================

const TITLES: Record<StepId, string> = {
  team: "Your team",
  repo: "Link a repository",
  mac: "Set up this Mac",
  rules: "Choose the rules",
  working: "It's working",
};

const PRESET_RULE_IDS = new Set(["collision_check", "pr_only_main", "no_conflict_pr", "journals", "no_self_approve", "solo_green", "brain_updates_required"]);

export function OnboardingWall({ org, repos, state, appSlug, openRequestBy, policies }: {
  org: OrgContext;
  repos: TeamRepo[];
  state: OnboardingState;
  appSlug: string;
  openRequestBy: string | null;
  /** Current values for Customise; keyed `${repo_id}:${rule}`. */
  policies: Record<string, boolean>;
}) {
  const isOwner = org.role === "owner";
  const isAdmin = hasRole(org.role, "admin");
  const repoStep = state.steps.find((s) => s.id === "repo")!;
  const installUrl = `https://github.com/apps/${appSlug}/installations/new`;
  const requestLink = `https://github.com/apps/${appSlug}`;
  const pendingOrWorking = state.repoState === "requested" || (!state.steps.find((s) => s.id === "working")!.done && repos.length > 0);

  return (
    <main className="min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-10">
      <RefreshWhile active={pendingOrWorking} />
      <div className="mx-auto max-w-[720px]">
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">
          {state.complete ? "You're set up" : isOwner ? `Let's set up ${org.orgName}` : `Welcome to ${org.orgName}`}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[13.5px] leading-[1.6] text-muted">
          {isOwner
            ? "Two things only you can do — link a repository and choose its rules — then the rest is your Mac and your editor."
            : "Your admin has the team side covered. What's left is your Mac and your editor."}
        </p>

        {state.repoState === "requested" && (
          <div className="mt-6 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-4 py-3 text-[13px] text-wait">
            <div className="font-semibold">Waiting on your GitHub org owner to approve DevBrain{openRequestBy ? ` (requested by ${openRequestBy})` : ""}.</div>
            <div className="mt-1 text-[12.5px]">Send them this link: <code className="rounded bg-row2 px-1 font-mono text-[11px] text-txt">{requestLink}</code>. This page updates itself when they approve.</div>
            {isAdmin && (
              <form action={cancelRequest} className="mt-2"><DeskNext />
                <button className="text-[12px] font-semibold text-accent hover:underline">Start over</button>
              </form>
            )}
          </div>
        )}

        <ol className="mt-8">
          {state.steps.map((s, n) => (
            <li key={s.id} className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${s.done ? "bg-go text-white" : "border border-line2 text-txt"}`}>{s.done ? "✓" : n + 1}</span>
              <div className="min-w-0">
                <div className={`font-display text-[18px] font-medium ${s.done ? "text-go" : "text-txt"}`}>{TITLES[s.id]}{s.by && s.done ? <span className="ml-2 font-body text-[12px] font-normal text-muted">by {s.by}</span> : null}</div>
                <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">{body(s, { isOwner, isAdmin, repos, installUrl, state, policies })}</div>
              </div>
            </li>
          ))}
        </ol>

        {state.blocking && (
          <form action={dismissOnboarding} className="mt-6"><DeskNext />
            <button className="text-[12px] text-muted hover:underline">Skip for now — I'll finish later</button>
          </form>
        )}
      </div>
    </main>
  );
}

function body(s: Step, c: { isOwner: boolean; isAdmin: boolean; repos: TeamRepo[]; installUrl: string; state: OnboardingState; policies: Record<string, boolean> }) {
  switch (s.id) {
    case "team":
      return <>You're in. Invite people later from Members.</>;
    case "repo":
      if (s.done) return <>{c.repos.map((r) => r.full_name).join(", ")}</>;
      if (s.state === "requested") return <>Requested — see above.</>;
      if (s.waitingOn) return <>Waiting on {s.waitingOn} to link a repository.</>;
      if (!c.isAdmin) return <>An admin links repositories.</>;
      return (
        <>
          Install the DevBrain GitHub App on the repository your team works in. If you're not an owner of the GitHub organisation, GitHub will send a request to whoever is — that's fine, this page will wait.
          <div className="mt-2"><ExternalLink href={c.installUrl} className="inline-block rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white">Link a repository</ExternalLink></div>
        </>
      );
    case "mac":
      return (
        <>
          One click installs the DevBrain command, the editor plugin and its hooks for Claude Code, Cursor and Codex, and keeps them updated. You'll be asked to allow Notifications and Reminders.
          <div className="mt-2"><SetupMac done={s.done} /></div>
        </>
      );
    case "rules":
      if (s.waitingOn) return <>Waiting on {s.waitingOn}.</>;
      if (c.repos.length === 0) return <>Link a repository first.</>;
      if (!c.isAdmin) return s.done ? <>Rules are set. See them under Rules.</> : <>An admin chooses the rules.</>;
      return <Rules repos={c.repos} policies={c.policies} done={s.done} />;
    case "working":
      if (c.repos.length === 0) return <>Link a repository first.</>;
      if (s.done) return <>DevBrain has seen your editor in a linked repository.</>;
      return <>Open your editor in {c.repos[0]!.full_name} — restart it if it was already open, so it picks up the plugin — and this turns green by itself.</>;
  }
}

// Presets first; Customise expands the same seven switches per repo, rendered
// from the catalogue so there is no second copy of the text.
function Rules({ repos, policies, done }: { repos: TeamRepo[]; policies: Record<string, boolean>; done: boolean }) {
  const installations = [...new Set(repos.map((r) => r.installation_id).filter((x): x is number => x !== null))];
  const catalogue: RuleDef[] = [...RULES_CATALOG, ...FEATURE_CATALOG].filter((c) => PRESET_RULE_IDS.has(c.rule));
  return (
    <>
      {!done && (
        <>
          Is it just you for now, or are you setting this up for a team?
          <div className="mt-2 flex flex-wrap gap-2">
            {installations.map((inst) => (
              <form key={inst} action={applyPreset} className="flex gap-2"><DeskNext />
                <input type="hidden" name="installationId" value={inst} />
                <button name="preset" value="solo" className="rounded-lg border border-line2 px-3 py-[7px] text-[12.5px] font-semibold text-txt hover:border-line3">Just me</button>
                <button name="preset" value="team" className="rounded-lg border border-line2 px-3 py-[7px] text-[12.5px] font-semibold text-txt hover:border-line3">A team</button>
              </form>
            ))}
          </div>
          <p className="mt-2">Both turn on session journals: when a session ends, a redacted excerpt — the conversation and which tools/files it used, never file contents or command output — is summarised into a journal the whole team can read, labelled with its author. Letting DevBrain merge or update branches for you is a separate switch on the Rules page.</p>
        </>
      )}
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-accent">{done ? "Adjust the rules" : "Customise instead"}</summary>
        {repos.map((r) => (
          <div key={r.id} className="mt-3">
            <div className="font-mono text-[11px] text-muted">{r.full_name}</div>
            {catalogue.map((c) => {
              const on = policies[`${r.id}:${c.rule}`] ?? false;
              return (
                <div key={c.rule} className="grid grid-cols-[1fr_36px] gap-6 border-t border-line py-3">
                  <div>
                    <div className="text-[13.5px] text-txt">{c.label}</div>
                    <div className="mt-[3px] text-[12px] leading-[1.6] text-muted">{c.detail}</div>
                  </div>
                  <form action={toggleRule}><DeskNext />
                    <input type="hidden" name="repoId" value={r.id} />
                    <input type="hidden" name="rule" value={c.rule} />
                    <input type="hidden" name="enabled" value={String(!on)} />
                    <button aria-label={on ? "Turn off" : "Turn on"} className="block"><Switch on={on} size="lg" /></button>
                  </form>
                </div>
              );
            })}
          </div>
        ))}
      </details>
    </>
  );
}
