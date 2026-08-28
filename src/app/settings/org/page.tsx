import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { leaveOrg } from "../members/actions";
import { deleteOrg, renameOrg } from "./actions";

export const dynamic = "force-dynamic";

export default async function OrgSettingsPage() {
  const me = await currentOrg();
  if (!me) redirect("/welcome");
  const isOwner = hasRole(me.role, "owner");
  const admin = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: repoCount }, { count: memberCount }, { count: ownerCount }, { data: orgRow }, { data: usage }] = await Promise.all([
    admin.from("linked_repos").select("id", { count: "exact", head: true }).eq("org_id", me.orgId).is("unlinked_at", null),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId),
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner"),
    admin.from("orgs").select("ai_daily_cap, plan").eq("id", me.orgId).single(),
    admin.from("ai_usage").select("calls, input_tokens, output_tokens").eq("org_id", me.orgId).eq("day", today).maybeSingle(),
  ]);
  const cap = orgRow?.ai_daily_cap ?? 0;
  const calls = usage?.calls ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round((calls / cap) * 100)) : 0;
  const soleOwner = isOwner && (ownerCount ?? 0) <= 1;

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-2xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Team</h1>
        <p className="mb-5 mt-1 text-sm text-slate-500">
          {memberCount ?? 0} member{memberCount === 1 ? "" : "s"} · {repoCount ?? 0} linked repo{repoCount === 1 ? "" : "s"} · you are <b>{me.role}</b>
        </p>

        <section className="card mb-6 card-pad">
          <h2 className="font-semibold text-slate-900">AI usage today</h2>
          <p className="mt-1 text-sm text-slate-500">
            {calls} of {cap} calls · {Number(usage?.input_tokens ?? 0).toLocaleString()} in / {Number(usage?.output_tokens ?? 0).toLocaleString()} out tokens · resets 00:00 UTC · plan <b>{orgRow?.plan ?? "beta"}</b>
          </p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div className={"h-full " + (pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-brand-600")} style={{ width: `${pct}%` }} />
          </div>
          {pct >= 100 && (
            <p className="mt-2 text-xs text-red-700">Budget spent — reviews, journals and digests pause for this team until midnight UTC. Presence, collisions and merge lights keep running.</p>
          )}
        </section>

        <section className="card mb-6 card-pad">
          <h2 className="font-semibold text-slate-900">Name</h2>
          {isOwner ? (
            <form action={renameOrg} className="mt-2 flex gap-2">
              <input name="name" defaultValue={me.orgName} maxLength={60} required className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none" />
              <button className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700">Save</button>
            </form>
          ) : (
            <p className="mt-1 text-sm text-slate-700">{me.orgName}</p>
          )}
        </section>

        <section className="card mb-6 card-pad">
          <h2 className="font-semibold text-slate-900">Leave this team</h2>
          <p className="mt-1 text-sm text-slate-500">
            {soleOwner ? "You're the only owner — make someone else an owner on the Members page before leaving." : "Your dev tokens for this team are revoked when you leave."}
          </p>
          {!soleOwner && (
            <form action={leaveOrg} className="mt-2">
              <button className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:border-red-300 hover:text-red-700">Leave {me.orgName}</button>
            </form>
          )}
        </section>

        {isOwner && (
          <section className="card border-red-200 card-pad">
            <h2 className="font-semibold text-red-700">Delete this team</h2>
            <p className="mt-1 text-sm text-slate-500">
              Removes every repo, task, journal and token under it. Type <b>{me.orgName}</b> to confirm.
            </p>
            <form action={deleteOrg} className="mt-2 flex gap-2">
              <input name="confirm" placeholder={me.orgName} className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-red-400 focus:outline-none" />
              <button className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">Delete team</button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
