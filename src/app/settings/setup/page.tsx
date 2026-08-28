import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { COOKIE } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createToken } from "../tokens/actions";

export const dynamic = "force-dynamic";

// Self-checking setup page. Every step detects its own completion from
// DevBrain's own data, so a new teammate can drive their whole onboarding
// without anyone watching — and an admin can see exactly where someone is stuck.

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={"card mb-3 card-pad " + (done ? "border-emerald-200 bg-emerald-50/30" : "")}>
      <div className="flex items-start gap-3">
        <span
          className={
            "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold " +
            (done ? "bg-emerald-500 text-white" : "bg-slate-900 text-white")
          }
        >
          {done ? "✓" : n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={"font-semibold " + (done ? "text-emerald-800" : "text-slate-900")}>{title}</h2>
          <div className="mt-1 text-sm text-slate-600">{children}</div>
        </div>
      </div>
    </section>
  );
}

export default async function SetupPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");
  if (!(await currentOrg())) redirect("/welcome");

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const login = String(meta.user_name || meta.preferred_username || user.email?.split("@")[0] || "you");

  const admin = supabaseAdmin();
  const [{ data: tokens }, { data: mySessions }, { data: myActivity }] = await Promise.all([
    supabase.from("dev_tokens").select("id, revoked_at"),
    admin
      .from("sessions")
      .select("id, last_seen, agent_kind")
      .eq("user_id", user.id)
      .order("last_seen", { ascending: false })
      .limit(1),
    admin
      .from("activity")
      .select("at")
      .eq("user_id", user.id)
      .order("at", { ascending: false })
      .limit(1),
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

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Set up DevBrain</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          Install the Mac app and you&apos;re done — it does the rest. Each step
          checks itself off once it works. The manual path is for terminals, CI,
          or non-Mac machines.
        </p>

        <Step n={1} title="Install the DevBrain Mac app" done={hasSession || hasActivity}>
          <p className="mb-2">
            Paste this in Terminal. It downloads the latest release, installs it to
            Applications and opens it — no other prerequisites (Node is bundled).
          </p>
          <pre className="select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{installCmd}</pre>
          <p className="mt-2">
            Then click the brain in the bottom corner (or Alt+Space), <b>Sign in</b> — your
            browser opens for GitHub — and <b>Set up this Mac</b>. That installs the{" "}
            <code className="rounded bg-slate-100 px-1">devbrain</code> CLI, the Claude Code plugin and a daily updater.
          </p>
          <p className="mt-2 text-xs text-slate-500">
            Prefer the DMG? Grab <code className="rounded bg-slate-100 px-1">DevBrain.dmg</code> from{" "}
            <a href="https://github.com/lukeb230/devbrain/releases/latest" target="_blank" className="text-brand-600 hover:underline">GitHub Releases</a>.
            macOS will call it &ldquo;damaged&rdquo; (it&apos;s unsigned, not damaged) — fix with{" "}
            <code className="rounded bg-slate-100 px-1">xattr -dr com.apple.quarantine /Applications/DevBrain.app</code> and open it again.
          </p>
          {(hasSession || hasActivity) && (
            <p className="mt-2 text-emerald-800">Done — DevBrain has seen this account working. Presence, collision warnings and the task board are live for you.</p>
          )}
        </Step>

        <Step n={2} title="Manual setup (no Mac app: CI, Linux, headless agents)" done={hasToken && (hasSession || hasActivity)}>
          <p className="mb-2">
            Create a token{hasToken ? " (you already have one — a new one is fine too)" : ""}, then paste the command it produces.
          </p>
          <form action={createToken} className="mt-2 flex gap-2">
            <input
              name="label"
              placeholder={`Label (e.g. ${login}-ci)`}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              {hasToken ? "New token" : "Create token"}
            </button>
          </form>
          {newToken && (
            <>
              <p className="mb-2 mt-3">
                Paste this in a terminal — it writes <code className="rounded bg-slate-100 px-1">~/.devbrain/config.json</code>. (Contains your new token; shown once.)
              </p>
              <pre className="select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">{oneLiner(newToken)}</pre>
              <p className="mt-2 text-xs text-slate-500">
                Then <code className="rounded bg-slate-100 px-1">{installCmd.replace("| sh", "| sh -s -- --cli")}</code> installs the CLI and plugin without the app.
                Headless agents can instead set <code className="rounded bg-slate-100 px-1">DEVBRAIN_URL</code> and <code className="rounded bg-slate-100 px-1">DEVBRAIN_TOKEN</code>.
              </p>
            </>
          )}
        </Step>

        <Step n={3} title="Plugin in Claude Code" done={hasSession}>
          <p className="mb-2">
            The Mac app installs it for you. To do it by hand, run these in any Claude Code session, then <strong>restart the session</strong>:
          </p>
          <pre className="select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`/plugin marketplace add lukeb230/devbrain
/plugin install devbrain@devbrain`}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Beta channel: <code className="rounded bg-slate-100 px-1">/plugin install devbrain-beta@devbrain</code>. Updating later:{" "}
            <code className="rounded bg-slate-100 px-1">devbrain update</code>, or{" "}
            <code className="rounded bg-slate-100 px-1">/plugin marketplace update devbrain</code> then{" "}
            <code className="rounded bg-slate-100 px-1">/plugin update devbrain@devbrain</code>.
            Presence hooks live inside the plugin.
          </p>
          {hasSession && (
            <p className="mt-2 text-emerald-800">
              Done — your Claude has checked in. Ask it &ldquo;what&apos;s the team up
              to?&rdquo; and it answers from live data.
            </p>
          )}
        </Step>
      </main>
    </>
  );
}
