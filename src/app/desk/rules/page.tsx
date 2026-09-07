import { redirect } from "next/navigation";
import { toggleRule } from "@/app/dashboard/[repoId]/rules/actions";
import { deleteRepo, unlinkRepo } from "@/app/dashboard/[repoId]/unlink-actions";
import { deskScope } from "@/lib/desk/scope";
import { installationWritePerms } from "@/lib/github-writer";
import { currentOrg, hasRole } from "@/lib/org";
import { FEATURE_CATALOG, RULES_CATALOG, WRITER_CATALOG, type RuleDef } from "@/lib/rules-catalog";
import { supabaseServer } from "@/lib/supabase/server";
import { writeGranted } from "@/lib/writer-gates";
import { DeskNext } from "../desk-next";
import { ExternalLink } from "../external-link";
import { RepoChooser } from "../repo-chooser";
import { Button, Card, Empty, Field, PageTitle } from "../ui";

// ============================================================================
// Desk · Rules — per repo: team rules (default on), features (default off),
// "Let DevBrain act on GitHub" (the phase-1 switches, gated on GitHub having
// granted write access), and unlink / delete for admins. Members see every
// switch, greyed. Same toggleRule action the dashboard and panel use.
// ============================================================================

export const dynamic = "force-dynamic";

function Switch({ repoId, rule, on, usable, title }: { repoId: string; rule: string; on: boolean; usable: boolean; title?: string }) {
  const cls = "relative inline-flex h-[18px] w-[30px] flex-shrink-0 items-center rounded-full transition-colors " + (on ? "bg-brand-600" : "bg-line2") + (usable ? "" : " cursor-not-allowed opacity-50");
  const knob = <span className={"inline-block h-[14px] w-[14px] transform rounded-full bg-white shadow transition-transform " + (on ? "translate-x-[14px]" : "translate-x-[2px]")} />;
  if (!usable) return <span className={cls} title={title} aria-disabled="true">{knob}</span>;
  return (
    <form action={toggleRule}>
      <DeskNext />
      <input type="hidden" name="repoId" value={repoId} />
      <input type="hidden" name="rule" value={rule} />
      <input type="hidden" name="enabled" value={String(!on)} />
      <button className={cls} aria-label={on ? "Turn off" : "Turn on"}>{knob}</button>
    </form>
  );
}

function RuleRow({ c, on, usable, title, fullName, repoId }: { c: RuleDef; on: boolean; usable: boolean; title?: string; fullName: string; repoId: string }) {
  return (
    <div className="flex items-start gap-3 border-t border-line py-2.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-txt">{c.label}</div>
        <div className="mt-0.5 text-[11px] leading-relaxed text-muted">{c.detail}</div>
        {c.ghPath && <ExternalLink href={`https://github.com/${fullName}/${c.ghPath}`} className="mt-1 inline-block font-display text-[11px] font-semibold text-brand-400 hover:underline">Enforce on GitHub ↗</ExternalLink>}
      </div>
      <Switch repoId={repoId} rule={c.rule} on={on} usable={usable} title={title} />
    </div>
  );
}

export default async function DeskRules({ searchParams }: { searchParams: Promise<{ repo?: string; error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const isAdmin = hasRole(org.role, "admin");

  const { data: repos } = await supabase.from("linked_repos").select("id, full_name, installation_id").eq("org_id", org.orgId).is("unlinked_at", null).order("created_at");
  const scope = await deskScope(sp, (repos ?? []).map((r) => r.id));
  if (!scope.repoId) {
    return (
      <>
        <PageTitle title="Rules" sub="Per repo. Admins change them; members see them." />
        <RepoChooser repos={repos ?? []} route="/desk/rules" what="rules" />
      </>
    );
  }
  const repo = (repos ?? []).find((r) => r.id === scope.repoId)!;
  const [{ data: rows }, perms] = await Promise.all([
    supabase.from("policies").select("rule, enabled").eq("repo_id", repo.id),
    repo.installation_id ? installationWritePerms(repo.installation_id) : Promise.resolve(null),
  ]);
  const state = new Map((rows ?? []).map((r) => [r.rule, r.enabled]));
  const writeReady = writeGranted(perms);
  const adminTitle = isAdmin ? undefined : "Admins only";

  return (
    <>
      <PageTitle title="Rules" sub={<>{repo.full_name} · rules toggled on are served to every Claude via the plugin{!isAdmin && <span className="ml-2 rounded-full border border-line2 px-2 py-0.5 font-mono text-[10px] text-muted">admins change these</span>}</>} />

      <Card title="Team rules" right="default on">
        {RULES_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={state.get(c.rule) ?? true} usable={isAdmin} title={adminTitle} fullName={repo.full_name} repoId={repo.id} />)}
      </Card>

      <Card title="Features" right="default off · takes effect on the next session end">
        {FEATURE_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={state.get(c.rule) ?? false} usable={isAdmin} title={adminTitle} fullName={repo.full_name} repoId={repo.id} />)}
      </Card>

      <Card
        title="Let DevBrain act on GitHub"
        right={<span className={writeReady ? "text-go" : "text-wait"}>{writeReady ? "write access granted" : "write access pending"}</span>}
      >
        <p className="mb-1 text-[11.5px] text-muted">Same app, no second install. Each action is off until an admin turns it on. Every write is a branch + pull request, or the merge of a PR a teammate approved — DevBrain never pushes to main. Everything it does shows in the feed as a bot write.</p>
        {!writeReady && (
          <p className="mb-1 text-[11.5px] text-wait">
            GitHub hasn&apos;t granted this installation write access yet. The owner of the GitHub account that installed DevBrain approves it under{" "}
            <ExternalLink href={`https://github.com/settings/installations/${repo.installation_id ?? ""}`} className="underline">Settings → Applications → DevBrain</ExternalLink> (organizations: the org&apos;s settings). Until then these switches stay off.
          </p>
        )}
        {WRITER_CATALOG.map((c) => <RuleRow key={c.rule} c={c} on={(state.get(c.rule) ?? false) && writeReady} usable={isAdmin && writeReady} title={!isAdmin ? "Admins only" : "Approve the app's write access on GitHub first"} fullName={repo.full_name} repoId={repo.id} />)}
      </Card>

      {isAdmin ? (
        <Card title="Unlink this repository" right="admins">
          <p className="mb-2 text-[11.5px] text-muted">Unlinking removes {repo.full_name} from DevBrain&apos;s panel, Desk and agent context; your Claude sessions in it stop reporting. GitHub access is separate — to also revoke the app&apos;s access, <ExternalLink href={`https://github.com/settings/installations/${repo.installation_id ?? ""}`} className="underline">edit the installation on GitHub</ExternalLink>.</p>
          <div className="grid grid-cols-2 gap-2.5">
            <form action={unlinkRepo} className="rounded-lg border border-line2 bg-ink p-3">
              <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
              <div className="text-[12.5px] text-txt">Unlink, keep history</div>
              <p className="mb-2 mt-0.5 text-[11px] text-muted">Tasks, journals, PR reviews and the brain index stay. Reinstalling the GitHub App on this repo links it again with everything intact.</p>
              <Button tone="ghost">Unlink</Button>
            </form>
            <form action={deleteRepo} className="rounded-lg border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] p-3">
              <DeskNext /><input type="hidden" name="repoId" value={repo.id} />
              <div className="text-[12.5px] text-stop">Unlink and delete everything</div>
              <p className="mb-2 mt-0.5 text-[11px] text-muted">Permanently deletes every task, journal, handoff, PR record and index entry for this repo. Type the full name to confirm.</p>
              <Field name="confirm" placeholder={repo.full_name} className="mb-2 font-mono" />
              <Button tone="danger">Delete</Button>
            </form>
          </div>
        </Card>
      ) : (
        <Card title="Unlink this repository"><Empty>Only team admins and owners can unlink or delete this repository.</Empty></Card>
      )}
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
