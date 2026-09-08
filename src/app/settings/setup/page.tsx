import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE } from "@/lib/cookies";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { BrowserShell } from "@/app/browser-shell";
import { createToken } from "../tokens/actions";

export const dynamic = "force-dynamic";

// Self-checking setup page (Dusk). Every step detects its own completion
// from DevBrain's own data, so a new teammate can drive their whole
// onboarding without anyone watching — and an admin can see where someone
// is stuck. The only browser page with a header: it links into the Desk.

const APP_SLUG = process.env.NEXT_PUBLIC_GH_APP_SLUG || "devbrain";

function Step({ n, title, done, children }: { n: number; title: string; done: boolean; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${done ? "bg-go text-white" : "border border-line2 text-txt"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0">
        <div className={`font-display text-[18px] font-medium ${done ? "text-go" : "text-txt"}`}>{title}</div>
        <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">{children}</div>
      </div>
    </section>
  );
}
const PRE = "mt-2 select-all overflow-x-auto rounded-lg bg-codebg px-3 py-2.5 font-mono text-[11px] leading-[1.6] text-codefg";
const CODE = "rounded bg-row2 px-1 font-mono text-[11px] text-txt";

export default async function SetupPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(meta.user_name || meta.preferred_username || user.email?.split("@")[0] || "you");

  const admin = supabaseAdmin();
  const [{ data: tokens }, { data: mySessions }, { data: myActivity }] = await Promise.all([
    supabase.from("dev_tokens").select("id, revoked_at"),
    admin.from("sessions").select("id, last_seen, agent_kind").eq("user_id", user.id).order("last_seen", { ascending: false }).limit(1),
    admin.from("activity").select("at").eq("user_id", user.id).order("at", { ascending: false }).limit(1),
  ]);

  const hasToken = (tokens ?? []).some((t) => !t.revoked_at);
  const hasSession = (mySessions ?? []).length > 0;
  const hasActivity = (myActivity ?? []).length > 0;
  const newToken = (await cookies()).get(COOKIE.newToken)?.value;
  const h = await headers();
  const server = (process.env.NEXT_PUBLIC_SITE_URL || `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`).replace(/\/$/, "");
  const installCmd = "curl -fsSL https://raw.githubusercontent.com/lukeb230/devbrain/main/install.sh | sh";

  // The paste-one-line connector: writes ~/.devbrain/config.json directly.
  // No clone, no prompts, no remote code — plain Node with the token inline.
  const oneLiner = (tok: string) =>
    `node -e "const o=require('os'),f=require('fs'),p=o.homedir()+'/.devbrain';f.mkdirSync(p,{recursive:true});f.writeFileSync(p+'/config.json',JSON.stringify({server:'${server}',token:'${tok}'},null,2));console.log('DevBrain connected ✓')"`;
  const nav = [["Members", "/desk/members"], ["Team", "/desk/team"], ["Reminders", "/desk/reminders"], ["Tokens", "/desk/tokens"]] as const;

  return (
    <BrowserShell>
      <header className="flex h-12 items-center gap-3.5 border-b border-line bg-row px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={25} height={20} alt="" />
        <span className="font-display text-[18px] font-medium text-txt">DevBrain</span>
        <span className="text-[12.5px] text-muted">{org.orgName}</span>
        <span className="ml-auto flex items-center gap-4 text-[12.5px] text-muted">
          {hasRole(org.role, "admin") && <a href={`https://github.com/apps/${APP_SLUG}/installations/new`} className="rounded-lg border border-line2 px-2.5 py-[5px] text-txt hover:border-line3">Link repo</a>}
          <span className="font-medium text-txt">Setup</span>
          {nav.map(([label, href]) => <Link key={href} href={href} className="hover:text-txt">{label}</Link>)}
          <form action="/auth/sign-out" method="post"><button className="hover:text-txt">Sign out</button></form>
        </span>
      </header>
      <main className="mx-auto max-w-[720px] px-10 py-8">
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Set up DevBrain</h1>
        <p className="mb-6 mt-2 max-w-[560px] text-[13px] leading-[1.6] text-muted">Install the Mac app and you&apos;re done — it does the rest. Each step checks itself off once it works. The manual path is for terminals, CI, or non-Mac machines.</p>

        <Step n={1} title="Install the DevBrain Mac app" done={hasSession || hasActivity}>
          <p>Paste this in Terminal. It downloads the latest release, installs it to Applications and opens it — no other prerequisites (Node is bundled).</p>
          <pre className={PRE}>{installCmd}</pre>
          <p className="mt-2">Then click the brain in the bottom corner (or Alt+Space), <b className="text-txt">Sign in</b> — your browser opens for GitHub — and <b className="text-txt">Set up this Mac</b>. That installs the <code className={CODE}>devbrain</code> CLI, the Claude Code plugin and a daily updater.</p>
          <p className="mt-2 text-[12px] text-faint">
            Prefer the DMG? Grab <code className={CODE}>DevBrain.dmg</code> from <a href="https://github.com/lukeb230/devbrain/releases/latest" target="_blank" className="text-accent hover:underline">GitHub Releases</a>. macOS will call it &ldquo;damaged&rdquo; (it&apos;s unsigned, not damaged) — fix with <code className={CODE}>xattr -dr com.apple.quarantine /Applications/DevBrain.app</code> and open it again.
          </p>
          {(hasSession || hasActivity) && <p className="mt-2 text-[12px] text-go">Done — DevBrain has seen this account working. Presence, collision warnings and the task board are live for you.</p>}
        </Step>

        <Step n={2} title="Manual setup (no Mac app: CI, Linux, headless agents)" done={hasToken && (hasSession || hasActivity)}>
          <p>Create a token{hasToken ? " (you already have one — a new one is fine too)" : ""}, then paste the command it produces.</p>
          <form action={createToken} className="mt-2 flex gap-2">
            <input name="label" placeholder={`Label (e.g. ${login}-ci)`} className="min-w-0 flex-1 rounded-lg border border-line2 bg-row px-3 py-2 text-[12.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
            <button className="whitespace-nowrap rounded-lg bg-accent2 px-3 py-2 text-[12px] font-semibold text-white">{hasToken ? "New token" : "Create token"}</button>
          </form>
          {newToken && (
            <>
              <p className="mt-3">Paste this in a terminal — it writes <code className={CODE}>~/.devbrain/config.json</code>. (Contains your new token; shown once.)</p>
              <pre className={PRE}>{oneLiner(newToken)}</pre>
              <p className="mt-2 text-[12px] text-faint">
                Then <code className={CODE}>{installCmd.replace("| sh", "| sh -s -- --cli")}</code> installs the CLI and plugin without the app. Headless agents can instead set <code className={CODE}>DEVBRAIN_URL</code> and <code className={CODE}>DEVBRAIN_TOKEN</code>.
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="Plugin in Claude Code" done={hasSession}>
          <p>The Mac app installs it for you. To do it by hand, run these in any Claude Code session, then <b className="text-txt">restart the session</b>:</p>
          <pre className={PRE}>{`/plugin marketplace add lukeb230/devbrain\n/plugin install devbrain@devbrain`}</pre>
          <p className="mt-2 text-[12px] text-faint">
            Beta channel: <code className={CODE}>/plugin install devbrain-beta@devbrain</code>. Updating later: <code className={CODE}>devbrain update</code>, or <code className={CODE}>/plugin marketplace update devbrain</code> then <code className={CODE}>/plugin update devbrain@devbrain</code>. Presence hooks live inside the plugin.
          </p>
          {hasSession && <p className="mt-2 text-[12px] text-go">Done — your Claude has checked in. Ask it &ldquo;what&apos;s the team up to?&rdquo; and it answers from live data.</p>}
        </Step>
      </main>
    </BrowserShell>
  );
}
