import { FONT_VARS } from "@/app/fonts";
import { redirect } from "next/navigation";
import { currentOrg, hasRole } from "@/lib/org";
import { currentUser, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { switchOrg } from "@/app/settings/org/actions";
import { deskScope } from "@/lib/desk/scope";
import { teamRepos } from "@/lib/desk/repos";
import { Jump } from "./jump";
import { DeskNav } from "./nav";
import { ThemeFollow } from "./theme-follow";
import { loadBilling } from "@/lib/billing/usage";
import { wallReason } from "@/lib/billing/wall";
import { PlanWall } from "./(team)/plan/page";
import { cookies } from "next/headers";
import { COOKIE } from "@/lib/cookies";
import { loadOnboarding } from "@/lib/onboarding-load";
import { OnboardingWall } from "./onboarding/wall";

// ============================================================================
// /desk — the app's full window (option B: menu-bar panel + this Desk in one
// Tauri app). Dusk shell: 48px title bar, 180px sidebar, then each page
// renders its own list pane (272px) and reading pane (see panes.tsx).
//
// Guard mirrors /widget: signed out → landing with ?from=desk (sign-in
// returns here); no team → /welcome. The Desk window shares the panel's
// cookie jar, so a signed-in panel means a signed-in Desk.
// ============================================================================


export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const [repos, billing] = await Promise.all([teamRepos(org.orgId), loadBilling(org.orgId)]);

  // Subscription before access: a team without an entitled subscription sees
  // only the plan wall, on every route, until Checkout completes.
  const walled = billing ? wallReason({ status: billing.status, hasSubscription: billing.hasSubscription, trialEndsAt: billing.trialEndsAt, periodEnd: billing.periodEnd }) !== null : false;

  const onboarding = await loadOnboarding(org, repos);
  // Current rule values for the wall's Customise list.
  const policyMap: Record<string, boolean> = {};
  if (repos.length) {
    const { data: pol } = await supabaseAdmin().from("policies").select("repo_id, rule, enabled").in("repo_id", repos.map((r) => r.id));
    for (const p of pol ?? []) policyMap[`${p.repo_id}:${p.rule}`] = Boolean(p.enabled);
  }
  const showOnboardingWall = !walled && onboarding.blocking;
  const onboardingNudge = onboarding.complete ? null : onboarding.repoState === "requested" ? "Waiting on GitHub approval" : "Finish setup";
  // One-shot message from the GitHub setup route (e.g. install_owned); the
  // cookie expires in 60 s, so a layout can read it without clearing it.
  const notice = (await cookies()).get(COOKIE.notice)?.value ?? null;
  // "Requested" does not block, so the owner reaches a Console with no repo.
  // That state must explain itself on every page — not look like a broken
  // product — so the banner lives here, above the panes.
  const pendingBanner = !showOnboardingWall && onboarding.repoState === "requested"
    ? `Waiting on your GitHub org owner to approve DevBrain${onboarding.openRequestBy ? ` (requested by ${onboarding.openRequestBy})` : ""}. Nothing here until they do — this page updates itself.`
    : null;

  // The effective scope (URL, else the remembered repo) — so the switcher
  // shows what the pages actually use.
  const scope = await deskScope(undefined, repos.map((r) => r.id));
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="dark"||t==="system")document.documentElement.dataset.wgTheme=t;}catch(e){}`;

  const initial = (org.login.trim()[0] ?? "?").toUpperCase();
  const appSlug = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";
  return (
    <div className={`wg ${FONT_VARS} font-body flex h-screen flex-col bg-ink text-[13.5px] text-txt`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      <ThemeFollow />

      {/* Flush window: this strip is the title bar — only the traffic lights
          live here, and it drags the window (data-tauri-drag-region). */}
      <div data-tauri-drag-region className="h-[34px] flex-shrink-0 bg-row" />

      <div className="flex min-h-0 flex-1">
        <DeskNav
          orgs={org.orgs.map((o) => ({ id: o.id, name: o.name }))}
          orgId={org.orgId}
          switchOrg={switchOrg}
          repos={repos.map((r) => ({ id: r.id, name: r.full_name }))}
          remembered={scope.repoId}
          appSlug={appSlug}
          canLink={hasRole(org.role, "admin")}
          onboardingNudge={onboardingNudge}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar over the panes: jump-to-anything and who you are. */}
          <div className="flex h-11 flex-shrink-0 items-center gap-4 border-b border-line bg-pane px-4">
            <Jump orgs={org.orgs.map((o) => ({ id: o.id, name: o.name }))} orgId={org.orgId} switchOrg={switchOrg} repos={repos.map((r) => ({ id: r.id, name: r.full_name }))} remembered={scope.repoId} />
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accent">{initial}</span>
              <span className="font-mono text-[10.5px] text-muted">{org.login} · {org.role}</span>
            </span>
          </div>
          {pendingBanner && (
            <div className="flex-shrink-0 border-b border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-4 py-2 text-[12.5px] text-wait">{pendingBanner}</div>
          )}
          <div className="flex min-h-0 flex-1">
            {walled && billing
              ? <PlanWall billing={billing} isAdmin={hasRole(org.role, "admin")} />
              : showOnboardingWall
                ? <OnboardingWall org={org} repos={repos} state={onboarding} appSlug={appSlug} openRequestBy={onboarding.openRequestBy} policies={policyMap} notice={notice} />
                : children}
          </div>
        </div>
      </div>
    </div>
  );
}
