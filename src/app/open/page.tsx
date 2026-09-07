import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainMark } from "@/components/BrainMark";
import { currentOrg } from "@/lib/org";
import { safeDeskRoute } from "@/lib/retire";
import { supabaseServer } from "@/lib/supabase/server";
import { InAppRedirect } from "./in-app";

// ============================================================================
// /open — where a retired dashboard URL lands, and where a signed-in visitor
// to the site lands. The browser is the front door, not the workplace: the
// page offers the app (a deep link into the Desk on the exact route), the
// download for a Mac without it, and "continue in the browser" as a fallback
// that is never a dead end.
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
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <InAppRedirect to={to} />
      <BrainMark size={56} />
      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">Open this in DevBrain</h1>
      {note && <p className="mt-2 text-sm text-slate-700">{note}</p>}
      <p className="mt-2 text-sm text-slate-500">
        DevBrain lives in the Mac app: a menu-bar panel for the glance, and the Desk for everything else. The browser is only for signing in, joining a team, linking a repo and downloading the app.
      </p>
      <div className="mt-6 flex w-full flex-col gap-2">
        <a href={`devbrain://desk${route}`} className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700">Open the Desk in the app</a>
        <a href={RELEASES} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">Don&apos;t have the app? Download it</a>
        <Link href={to} className="mt-1 text-xs text-slate-500 hover:text-slate-800 hover:underline">Continue in the browser instead</Link>
      </div>
      <p className="mt-8 text-xs text-slate-400">
        Beta build? <a href={`devbrain-beta://desk${route}`} className="underline">Open in DevBrain Beta</a>. Setting up a new Mac by hand: <Link href="/settings/setup" className="underline">setup page</Link>.
      </p>
    </main>
  );
}
