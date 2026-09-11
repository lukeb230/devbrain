import { redirect } from "next/navigation";
import { toggleRule } from "@/app/dashboard/[repoId]/rules/actions";
import { deleteRepo, unlinkRepo } from "@/app/dashboard/[repoId]/unlink-actions";
import { deskScope } from "@/lib/desk/scope";
import { installationWritePerms } from "@/lib/github-writer";
import { currentOrg, hasRole } from "@/lib/org";
import { FEATURE_CATALOG, RULES_CATALOG, WRITER_CATALOG, type RuleDef } from "@/lib/rules-catalog";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { writeGranted } from "@/lib/writer-gates";
import { DeskNext } from "../../desk-next";
import { ExternalLink } from "../../external-link";
import { Reading } from "../../panes";
import { RepoChooser } from "../../repo-chooser";
import { Button, Field, Section, Switch } from "../../ui";

// ============================================================================
// Desk · Rules (Dusk) — per repo: team rules (default on), features
// (default off), "Let DevBrain act on GitHub" (gated on GitHub having
// granted write access), and unlink / delete for admins. Members see every
// switch, greyed. Same toggleRule action the panel used.
// ============================================================================

export const dynamic = "force-dynamic";

function RuleSwitch({ repoId, rule, on, usable, title }: { repoId: string; rule: string; on: boolean; usable: boolean; title?: string }) {
  if (!usable) return <span title={title}><Switch on={on} size="lg" disabled /></span>;
  return (
    <form action={toggleRule}>
      <DeskNext />
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="rule" value={rule} />
      <input type="hidden" name="enabled" value={String(!on)} />
      <button aria-label={on ? "Turn off" : "Turn on"} className="block"><Switch on={on} size="lg" /></button>
    </form>
  );
}

function RuleRow({ c, on, usable, title, fullName, repoId }: { c: RuleDef; on: boolean; usable: boolean; title?: string; fullName: string; repoId: string }) {
  return (
    <div className="grid grid-cols-[1fr_36px] gap-6 border-t border-line py-3.5">
      <div>
        <div className="text-[14px] text-txt">{c.label}</div>
        <div className="mt-[3px] text-[12.5px] leading-[1.6] text-muted">
          {c.detail}
          {c.ghPath && <> <ExternalLink href={`https://github.com/${fullName}/${c.ghPath}`} className="text-[12px] text-accent hover:underline">Enforce on GitHub ↗</ExternalLink></>}
        </div>
      </div>
      <RuleSwitch repoId={repoId} rule={c.rule} on={on} usable={usable} title={title} />
    </div>
  );
}

export default async function DeskRules({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const isAdmin = hasRole(org.role, "admin");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name, installation_id").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) {
    return (
      <>
        <RepoChooser repos={repos ?? []} route="/desk/rules" what="rules" title="Rules" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const [{ data: rows }, perms] = await Promise.all([
    supabase.from("policies").select("rule, enabled").eq("repo_id", repo.id),
    repo.installation_id ? installationWritePerms(repo.installation_id) : Promise.resolve(null)
  ]);
  const state = new Map((rows ?? []).map((r) => [r.rule, r.enabled]));
  const writeReady = writeGranted(perms);
  const adminTitle = isAdmin ? undefined : "Admins only";

  return (
    <>
      <Reading>
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Rules <span className="ml-2 font-mono text-[12px] font-normal text-faint">{repo.full_name} · served to every Claude via the plugin{!isAdmin ? " · admins change these" : ""}</span></h1>

        <Section title="Team rules" hint="default on">
          <div className="mt-2">{RULES_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={state.get(c.rule) ?? true} usable={isAdmin} title={adminTitle} fullName={repo.full_name} repoId={repo.id} />)}</div>
        </Section>

        <Section title="Features" hint="default off · takes effect on the next session end" className="mt-8">
          <div className="mt-2">{FEATURE_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={state.get(c.rule) ?? false} usable={isAdmin} title={adminTitle} fullName={repo.full_name} repoId={repo.id} />)}</div>
        </Section>

        <Section title="Let DevBrain act on GitHub" hint={<span className={writeReady ? "text-go" : "text-wait"}>{writeReady ? "write access granted" : "write access pending"}</span>} className="mt-8">
          <p className="mt-2 max-w-[640px] text-[12.5px] leading-[1.6] text-muted">Same app, no second install. Each action is off until an admin turns it on. Every write is a branch + pull request, or the merge of a PR a teammate approved — DevBrain never pushes to main. Everything it does shows in the feed as a bot write.</p>
          {!writeReady && (
            <p className="mt-2 max-w-[640px] text-[12.5px] leading-[1.6] text-wait">
              GitHub hasn&apos;t granted this installation write access yet. The owner of the GitHub account that installed DevBrain approves it under{" "}
              <ExternalLink href={`https://github.com/settings/installations/${repo.installation_id ?? ""}`} className="underline">Settings → Applications → DevBrain</ExternalLink> (organizations: the org&apos;s settings). Until then these switches stay off.
            </p>
          )}
          <div className="mt-2">{WRITER_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={(state.get(c.rule) ?? false) && writeReady} usable={isAdmin && writeReady} title={!isAdmin ? "Admins only" : "Approve the app's write access on GitHub first"} fullName={repo.full_name} repoId={repo.id} />)}</div>
        </Section>

        <Section title="Unlink this repository" hint="admins" className="mt-8">
          {isAdmin ? (
            <>
              <p className="mb-3.5 mt-2 max-w-[640px] text-[12.5px] leading-[1.6] text-muted">Unlinking removes {repo.full_name} from DevBrain&apos;s panel, Desk and agent context; your Claude sessions in it stop reporting. GitHub access is separate — to also revoke the app&apos;s access, <ExternalLink href={`https://github.com/settings/installations/${repo.installation_id ?? ""}`} className="text-accent hover:underline">edit the installation on GitHub</ExternalLink>.</p>
              <div className="grid grid-cols-2 gap-4">
                <form action={unlinkRepo} className="rounded-xl border border-line bg-row p-4">
                  <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
                  <div className="text-[14px] text-txt">Unlink, keep history</div>
                  <p className="mb-3 mt-1 text-[12.5px] leading-[1.6] text-muted">Tasks, journals, PR reviews and the brain index stay. Reinstalling the GitHub App on this repo links it again with everything intact.</p>
                  <Button tone="ghost">Unlink</Button>
                </form>
                <form action={deleteRepo} className="rounded-xl border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] p-4">
                  <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
                  <div className="text-[14px] text-stop">Unlink and delete everything</div>
                  <p className="mb-3 mt-1 text-[12.5px] leading-[1.6] text-muted">Permanently deletes every task, journal, handoff, PR record and index entry for this repo. Type the full name to confirm.</p>
                  <div className="flex gap-2">
                    <Field name="confirm" placeholder={repo.full_name} mono ground="ink" className="min-w-0 flex-1 border-[var(--wg-stop-line)]" />
                    <Button tone="danger">Delete</Button>
                  </div>
                </form>
              </div>
            </>
          ) : (
            <p className="mt-2 text-[12.5px] text-faint">Only team admins and owners can unlink or delete this repository.</p>
          )}
        </Section>
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </Reading>
    </>
  );
}
