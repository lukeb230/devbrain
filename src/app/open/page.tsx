import Link from "next/link";
import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { safeDeskRoute } from "@/lib/retire";
import { supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "../browser-shell";
import { InAppRedirect } from "./in-app";

// ============================================================================
// /open (Dusk) — where a retired dashboard URL lands, and where a signed-in
// visitor to the site lands. The browser is the front door, not the
// workplace: the page offers the app (a deep link into the Desk on the exact
// route), the download for a Mac without it, and "continue in the browser"
// as a fallback that is never a dead end.
// ============================================================================

export const dynamic = "force-dynamic";

const RELEASES = "https://github.com/lukeb230/devbrain/releases/latest";

export default async function OpenPage({ searchParams }: { searchParams: Promise<{ to?: string; joined?: string; created?: string; unlinked?: string; deleted?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const to = safeDeskRoute(sp.to);
  const route = to.replace(/^\/desk/, "") || "/";
  const note = sp.joined ? `You're in — welcome to ${org.orgName}.` : sp.created ? `${org.orgName} is ready.` : sp.unlinked ? `${sp.unlinked} was unlinked.` : sp.deleted ? `${sp.deleted} was deleted.` : null;

  return (
    <BrowserShell>
      <InAppRedirect to={to} />
      <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center px-11 py-11">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={49} height={40} alt="" />
        <h1 className="mt-4 font-display text-[32px] font-medium tracking-[-.02em] text-txt">Open this in DevBrain</h1>
        {note && <p className="mt-2 text-[13.5px] text-go">{note}</p>}
        <p className="mt-2 text-[13px] leading-[1.6] text-muted">DevBrain lives in the Mac app: a menu-bar panel for the glance, and the Desk for everything else. The browser is only for signing in, joining a team, linking a repo and downloading the app.</p>
        <div className="mt-[22px] flex flex-col gap-2">
          <a href={`devbrain://desk${route}`} className="rounded-[10px] bg-accent2 px-4 py-[11px] text-center text-[13px] font-semibold text-white hover:brightness-110">Open the Desk in the app</a>
          <a href={RELEASES} className="rounded-[10px] border border-line2 bg-row px-4 py-[11px] text-center text-[13px] font-medium text-txt hover:border-line3">Don&apos;t have the app? Download it</a>
          <Link href={to} className="text-center text-[12px] text-muted hover:text-txt hover:underline">Continue in the browser instead</Link>
        </div>
        <p className="mt-10 text-[11.5px] leading-[1.6] text-faint">
          Beta build? <a href={`devbrain-beta://desk${route}`} className="text-accent hover:underline">Open in DevBrain Beta</a>. Setting up a new Mac by hand: <Link href="/settings/setup" className="text-accent hover:underline">setup page</Link>.
        </p>
      </main>
    </BrowserShell>
  );
}
