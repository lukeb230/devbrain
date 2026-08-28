import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { Notice } from "@/components/Notice";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { createInvite, removeMember, revokeInvite, setRole } from "./actions";

export const dynamic = "force-dynamic";

// The team roster and its invite links. Anyone in the org can see who is
// here; admins mint invites; owners change roles and remove people.

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 60) return `${Math.max(min, 0)}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/welcome");
  const isOwner = hasRole(me.role, "owner");
  const isAdmin = hasRole(me.role, "admin");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const admin = supabaseAdmin();
  const [{ data: members }, { data: invites }, { data: sessions }] = await Promise.all([
    admin.from("org_members").select("user_id, role, github_login, created_at").eq("org_id", me.orgId).order("created_at"),
    admin.from("org_invites").select("id, code, role, created_by, max_uses, uses, expires_at, revoked_at, created_at").eq("org_id", me.orgId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    admin.from("sessions").select("dev_label, last_seen").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(200),
  ]);
  const lastSeen = new Map<string, string>();
  for (const s of sessions ?? []) {
    const k = String(s.dev_label || "").toLowerCase();
    if (k && !lastSeen.has(k)) lastSeen.set(k, s.last_seen);
  }

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-3xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{me.orgName} · members</h1>
        <p className="mb-5 mt-1 max-w-xl text-sm text-slate-500">
          Invite links add people to this team with one click. They sign in with GitHub, install the DevBrain app, and they&apos;re in.
        </p>
        <Notice error={error} />

        <section className="card mb-6">
          <ul className="divide-y divide-slate-100">
            {(members ?? []).map((m) => {
              const login = String(m.github_login || "").toLowerCase();
              const seen = lastSeen.get(login);
              const self = m.user_id === me.userId;
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <a href={`https://github.com/${login}`} target="_blank" className="font-medium text-slate-900 hover:text-brand-600">
                    {m.github_login}{self ? " (you)" : ""}
                  </a>
                  {isOwner && !self ? (
                    <form action={setRole} className="flex items-center gap-1">
                      <input type="hidden" name="userId" value={m.user_id} />
                      <select name="role" defaultValue={m.role} className="rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-xs">
                        <option value="owner">owner</option>
                        <option value="admin">admin</option>
                        <option value="member">member</option>
                      </select>
                      <button className="text-xs text-slate-500 hover:text-slate-900">Save</button>
                    </form>
                  ) : (
                    <span className="chip bg-slate-100 text-slate-600">{m.role}</span>
                  )}
                  {seen ? (
                    <span className="chip bg-emerald-50 text-emerald-700">active {timeAgo(seen)}</span>
                  ) : (
                    <span className="chip bg-amber-50 text-amber-700">machine not connected yet</span>
                  )}
                  <span className="text-xs text-slate-400">joined {timeAgo(m.created_at)}</span>
                  {isOwner && !self && (
                    <form action={removeMember} className="ml-auto">
                      <input type="hidden" name="userId" value={m.user_id} />
                      <button className="text-xs text-slate-400 hover:text-red-600">Remove</button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="card mb-6">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Invite links</h2>
            <p className="mt-0.5 text-xs text-slate-500">Links expire after 7 days. Reusable unless marked single-use.</p>
          </div>
          {isAdmin && (
            <form action={createInvite} className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm">
              <label className="flex items-center gap-1.5 text-slate-600">
                Role
                <select name="role" defaultValue="member" className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-sm">
                  <option value="member">member</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-slate-600">
                <input type="checkbox" name="single" /> single-use
              </label>
              <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">New invite link</button>
            </form>
          )}
          {!invites || invites.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">No active invite links.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <code className="select-all rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">{origin}/join/{i.code}</code>
                  <span className="chip bg-slate-100 text-slate-600">{i.role}</span>
                  <span className="text-xs text-slate-400">
                    {i.max_uses === 1 ? (i.uses >= 1 ? "used" : "single-use") : `used ${i.uses}×`} · by {i.created_by} · expires in {Math.max(1, Math.round((new Date(i.expires_at).getTime() - Date.now()) / 86_400_000))}d
                  </span>
                  {isAdmin && (
                    <form action={revokeInvite} className="ml-auto">
                      <input type="hidden" name="id" value={i.id} />
                      <button className="text-xs text-slate-400 hover:text-red-600">Revoke</button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="text-xs text-slate-500">
          Roles: <b>owner</b> manages roles, members and the team itself; <b>admin</b> also mints invites, links and unlinks repos, edits team rules, connects the writer app and maps Reminders; <b>member</b> does everything else — tasks, claims, handoffs, specs, their own tokens.
        </p>
      </main>
    </>
  );
}
