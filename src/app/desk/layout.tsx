import { Bricolage_Grotesque, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { switchOrg } from "@/app/settings/org/actions";
import { deskScope } from "@/lib/desk/scope";
import { DeskNav, DeskRepoSwitcher } from "./nav";

// ============================================================================
// /desk — the app's full window (option B: menu-bar panel + this Desk in one
// Tauri app). Sidebar layout. This is the SHELL (phase 3): guard, fonts,
// sidebar groups, title-bar switchers. Pages are ported in phase 4 — until
// then each section renders a placeholder that names what lands there.
//
// Guard mirrors /widget: signed out → landing with ?from=desk (sign-in
// returns here); no team → /welcome. The Desk window shares the panel's
// cookie jar, so a signed-in panel means a signed-in Desk.
// ============================================================================

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display", display: "swap" });
const body = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

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
  const early = `try{var t=localStorage.getItem("devbrain_theme");if(t==="light"||t==="dark")document.documentElement.dataset.wgTheme=t;}catch(e){}`;

  return (
    <div className={`wg ${display.variable} ${body.variable} ${mono.variable} font-body flex h-screen flex-col bg-ink text-txt`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />

      {/* Title bar: team + repo switchers, jump-to (placeholder) */}
      <header className="flex h-11 flex-shrink-0 items-center gap-2 border-b border-line bg-row px-3">
        <span className="font-display text-[13px] font-semibold tracking-tight">DevBrain</span>
        <span className="text-faint">·</span>
        {org.orgs.length > 1 ? (
          <form action={switchOrg} className="flex items-center gap-1">
            <input type="hidden" name="next" value="/desk" />
            <select name="orgId" defaultValue={org.orgId} className="rounded-md border border-line2 bg-ink px-2 py-0.5 text-[12px] text-txt">
              {org.orgs.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <button className="text-[11px] text-muted hover:text-txt">Switch</button>
          </form>
        ) : (
          <span className="text-[12px] text-muted">team <b className="font-medium text-txt">{org.orgName}</b></span>
        )}
        <DeskRepoSwitcher repos={(repos ?? []).map((r) => ({ id: r.id, name: r.full_name }))} remembered={scope.repoId} />
        <span className="flex-1" />
        <span className="rounded-md border border-line2 px-2.5 py-0.5 font-mono text-[10.5px] text-faint" title="Jump to anything (phase 4)">⌕ jump to anything… ⌘K</span>
        <span className="ml-2 font-mono text-[10px] text-faint">{org.login} · {org.role}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <DeskNav />
        <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">{children}</main>
      </div>
    </div>
  );
}
