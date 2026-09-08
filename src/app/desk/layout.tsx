import { FONT_VARS } from "@/app/fonts";
import { redirect } from "next/navigation";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { switchOrg } from "@/app/settings/org/actions";
import { deskScope } from "@/lib/desk/scope";
import { Jump } from "./jump";
import { DeskNav } from "./nav";
import { ThemeFollow } from "./theme-follow";

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
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const { data: repos } = await supabase
    .from("linked_repos")
    .select("id, full_name")
    .eq("org_id", org.orgId)
    .is("unlinked_at", null)
    .order("created_at");

  // The effective scope (URL, else the remembered repo) — so the switcher
  // shows what the pages actually use.
  const scope = await deskScope(undefined, (repos ?? []).map((r) => r.id));
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
          repos={(repos ?? []).map((r) => ({ id: r.id, name: r.full_name }))}
          remembered={scope.repoId}
          appSlug={appSlug}
          canLink={hasRole(org.role, "admin")}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Toolbar over the panes: jump-to-anything and who you are. */}
          <div className="flex h-11 flex-shrink-0 items-center gap-4 border-b border-line bg-pane px-4">
            <Jump orgs={org.orgs.map((o) => ({ id: o.id, name: o.name }))} orgId={org.orgId} switchOrg={switchOrg} repos={(repos ?? []).map((r) => ({ id: r.id, name: r.full_name }))} remembered={scope.repoId} />
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accent">{initial}</span>
              <span className="font-mono text-[10.5px] text-muted">{org.login} · {org.role}</span>
            </span>
          </div>
          <div className="flex min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
