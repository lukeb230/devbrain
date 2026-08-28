import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";
import { createToken } from "../tokens/actions";

export const dynamic = "force-dynamic";

// Self-checking setup page. Every step detects its own completion from
// DevBrain's own data, so a new teammate can drive their whole onboarding
// without anyone watching — and Luke can see exactly where someone is stuck.

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
  const newToken = (await cookies()).get("devbrain_new_token")?.value;
  const server = process.env.NEXT_PUBLIC_SITE_URL ?? "https://devbrain.vercel.app";

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
          Three steps, about five minutes. Each one checks itself off once it
          works — no need to ask anyone whether it worked.
        </p>

        <Step n={1} title="Create your token" done={hasToken}>
          {hasToken ? (
            <p>
              Done — you have an active token. Need a fresh one (lost it, new
              machine)? Create another below and re-run step 2.
            </p>
          ) : (
            <p className="mb-2">
              This is what connects your machine to the team. It&apos;s shown once.
            </p>
          )}
          <form action={createToken} className="mt-2 flex gap-2">
            <input
              name="label"
              placeholder={`Label (e.g. ${login}-laptop)`}
              className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none"
            />
            <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">
              {hasToken ? "New token" : "Create token"}
            </button>
          </form>
        </Step>

        <Step n={2} title="Connect this machine" done={hasSession || hasActivity}>
          {newToken ? (
            <>
              <p className="mb-2">
                Paste this in a terminal — it writes your config file. (Contains
                your new token; it&apos;s only shown here once.)
              </p>
              <pre className="select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                {oneLiner(newToken)}
              </pre>
            </>
          ) : hasSession || hasActivity ? (
            <p>
              Done — DevBrain has seen this account working. Presence,
              collision warnings, and the task board are live for you.
            </p>
          ) : (
            <p>
              Create a token in step 1 (or a new one) — the exact command to
              paste, with your token already in it, appears here right after.
            </p>
          )}
        </Step>

        <Step n={3} title="Install the plugin in Claude Code" done={hasSession}>
          <p className="mb-2">
            In any Claude Code session, run these two lines, then{" "}
            <strong>restart the session</strong>:
          </p>
          <pre className="select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`/plugin marketplace add lukeb230/devbrain
/plugin install devbrain@devbrain-marketplace`}
          </pre>
          <p className="mt-2 text-xs text-slate-500">
            Already installed an older version? Use{" "}
            <code className="rounded bg-slate-100 px-1">/plugin marketplace update devbrain-marketplace</code>{" "}
            then{" "}
            <code className="rounded bg-slate-100 px-1">/plugin update devbrain@devbrain-marketplace</code>.
            The plugin now carries presence itself — no CLI, no second clone.
          </p>
          {hasSession && (
            <p className="mt-2 text-emerald-800">
              Done — your Claude has checked in. Ask it &ldquo;what&apos;s the team up
              to?&rdquo; and it answers from live data.
            </p>
          )}
        </Step>

        <section className="card card-pad">
          <h2 className="font-semibold text-slate-900">Optional: the desktop widget</h2>
          <p className="mt-1 text-sm text-slate-600">
            A menu-bar app (no Dock icon) that hovers the team state in the corner
            of your screen with native notifications. Ask Luke for{" "}
            <code className="rounded bg-slate-100 px-1">DevBrain-widget.zip</code>, then paste:
          </p>
          <pre className="mt-2 select-all overflow-x-auto rounded-md bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
{`unzip -o ~/Downloads/DevBrain-widget.zip -d /Applications && xattr -dr com.apple.quarantine /Applications/DevBrain.app && open /Applications/DevBrain.app`}
          </pre>
        </section>
      </main>
    </>
  );
}
