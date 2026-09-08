import { FONT_VARS } from "@/app/fonts";
import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { switchOrg } from "@/app/settings/org/actions";
import { deskScope } from "@/lib/desk/scope";
import { DeskNav, DeskRepoSwitcher } from "./nav";
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
  return (
    <div className={`wg ${FONT_VARS} font-body flex h-screen flex-col bg-ink text-[13.5px] text-txt`}>
      <script dangerouslySetInnerHTML={{ __html: early }} />
      <ThemeFollow />

      {/* Title bar (Dusk): mark + wordmark · team / repo · jump-to · avatar + login · role */}
      {/* The header is the window's title bar (overlay style): the traffic
          lights sit in the first ~78px, and the bar drags the window. Only
          elements carrying data-tauri-drag-region start a drag, so the
          switchers and the jump field keep their clicks. */}
      <header data-tauri-drag-region className="flex h-12 flex-shrink-0 items-center gap-4 border-b border-line bg-row pl-[78px] pr-[18px]">
        <span data-tauri-drag-region className="flex items-center gap-[9px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img data-tauri-drag-region src="/brain.png" width={25} height={20} alt="" />
          <span data-tauri-drag-region className="font-display text-[19px] font-medium tracking-[-.01em]">DevBrain</span>
        </span>
        <span className="flex items-center text-[12.5px] text-muted">
          {org.orgs.length > 1 ? (
            <form action={switchOrg} className="flex items-center">
              <input type="hidden" name="next" value="/desk" />
              <select name="orgId" defaultValue={org.orgId} className="cursor-pointer border-0 bg-transparent p-0 text-[12.5px] text-muted focus:outline-none">
                {org.orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
              <button className="ml-1 text-[11px] text-faint hover:text-txt">switch</button>
            </form>
          ) : (
            <span>{org.orgName}</span>
          )}
          <span className="mx-1.5 text-line3">/</span>
          <DeskRepoSwitcher repos={(repos ?? []).map((r) => ({ id: r.id, name: r.full_name }))} remembered={scope.repoId} />
        </span>
        <span data-tauri-drag-region className="flex-1" />
        <span className="flex w-[320px] items-center gap-2 rounded-lg border border-line bg-ink px-2.5 py-1.5 text-[12.5px] text-faint" title="Jump to anything (coming)">
          ⌕ <span className="flex-1">Jump to anything</span><span className="font-mono text-[10px]">⌘K</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accent">{initial}</span>
          <span className="font-mono text-[10.5px] text-muted">{org.login} · {org.role}</span>
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <DeskNav />
        {children}
      </div>
    </div>
  );
}
