import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createInvite, removeMember, revokeInvite, setRole } from "@/app/settings/members/actions";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { Copy } from "../../copy";
import { DeskNext } from "../../desk-next";
import { Reading } from "../../panes";
import { ACTION_MUTED, ACTION_STOP, Avatar, Button, Empty, Pill, Section, Select } from "../../ui";

// ============================================================================
// Desk · Members (Dusk) — people rows (36px avatar, role pill or role select
// + set + remove), the roles footnote, invite links (new link as role +
// single-use; copy / revoke). Owners change roles and remove; admins invite.
// ============================================================================

export const dynamic = "force-dynamic";

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DeskMembers({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const me = await currentOrg();
  if (!me) redirect("/?from=desk");
  const isOwner = hasRole(me.role, "owner");
  const isAdmin = hasRole(me.role, "admin");
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  const admin = supabaseAdmin();
  const [{ data: members }, { data: invites }, { data: sessions }] = await Promise.all([
    admin.from("org_members").select("user_id, role, github_login, created_at").eq("org_id", me.orgId).order("created_at"),
    admin.from("org_invites").select("id, code, role, created_by, max_uses, uses, expires_at").eq("org_id", me.orgId).is("revoked_at", null).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }),
    admin.from("sessions").select("dev_label, last_seen").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(200)
  ]);
  const lastSeen = new Map<string, string>();
  for (const s of sessions ?? []) {
    const k = String(s.dev_label || "").toLowerCase();
    if (k && !lastSeen.has(k)) lastSeen.set(k, s.last_seen);
  }
  const owners = (members ?? []).filter((m) => m.role === "owner").length;

  return (
    <>
      <Reading>
        <div className="flex items-end gap-4">
          <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Members <span className="ml-2 font-mono text-[12px] font-normal text-faint">{me.orgName} · {members?.length ?? 0} {members?.length === 1 ? "person" : "people"}</span></h1>
          {isAdmin && <Button form="invite-form" className="ml-auto">New invite link</Button>}
        </div>
        <p className="mt-2 text-[13px] leading-[1.6] text-muted">Invite links add someone with one click: they sign in with GitHub, install the app, and they&apos;re in.</p>

        <section className="mt-6">
          {(members ?? []).map((m, i) => {
            const login = String(m.github_login || "");
            const seen = lastSeen.get(login.toLowerCase());
            const self = m.user_id === me.userId;
            const lastOwner = m.role === "owner" && owners <= 1;
            return (
              <div key={m.user_id} className={`grid grid-cols-[36px_1fr_auto] items-center gap-4 border-t border-line py-3.5 ${i === (members?.length ?? 0) - 1 ? "border-b" : ""}`}>
                <Avatar name={login || "?"} me={self} size={36} />
                <div>
                  <div className={`text-[14px] ${self ? "text-accent2" : "text-txt"}`}>{login || "(no GitHub login)"}{self && <span className="text-faint"> · you</span>}</div>
                  <div className="mt-0.5 text-[12px] text-muted">{seen ? `last seen ${timeAgo(seen)}` : "never seen in a session"} · joined {timeAgo(m.created_at)}</div>
                </div>
                {isOwner && !self ? (
                  <span className="flex items-center gap-3">
                    <form action={setRole} className="flex items-center gap-3">
                      <DeskNext /><input type="hidden" name="userId" value={m.user_id} />
                      <Select name="role" defaultValue={m.role} size="sm"><option value="owner">owner</option><option value="admin">admin</option><option value="member">member</option></Select>
                      <button className="text-[12px] text-accent hover:underline">set</button>
                    </form>
                    <form action={removeMember}><DeskNext /><input type="hidden" name="userId" value={m.user_id} /><button className={ACTION_MUTED} title={lastOwner ? "The last owner can't be removed" : undefined} disabled={lastOwner}>remove</button></form>
                  </span>
                ) : (
                  <Pill tone="muted">{m.role}</Pill>
                )}
              </div>
            );
          })}
          <p className="mt-3 text-[12px] leading-[1.6] text-faint">owner manages roles, members and the team itself · admin also mints invites, links repos, edits rules and maps Reminders · member does everything else.</p>
        </section>

        <Section title="Invite links" count={invites?.length ?? 0} hint="expire after 7 days" className="mt-8">
          {isAdmin && (
            <form id="invite-form" action={createInvite} className="mt-2.5 flex items-center gap-3 border-t border-line py-3 text-[12.5px] text-muted">
              <DeskNext />
              New link as <Select name="role" defaultValue="member" size="sm"><option value="member">member</option><option value="admin">admin</option></Select>
              <label className="flex items-center gap-1.5"><input type="checkbox" name="single" className="accent-[var(--wg-accent-strong)]" /> single-use</label>
            </form>
          )}
          {!invites || invites.length === 0 ? (
            <Empty className="border-t border-line">No active invite links.</Empty>
          ) : (
            invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 border-t border-line py-3">
                <div className="min-w-0 flex-1">
                  <code className="font-mono text-[12.5px] text-txt">{origin}/join/{i.code}</code>
                  <div className="mt-[3px] text-[12px] text-muted">{i.role} · {i.max_uses === 1 ? (i.uses >= 1 ? "used" : "single-use") : `used ${i.uses}×`} · by {i.created_by} · expires in {Math.max(1, Math.round((new Date(i.expires_at).getTime() - Date.now()) / 86_400_000))}d</div>
                </div>
                <Copy text={`${origin}/join/${i.code}`} />
                {isAdmin && <form action={revokeInvite}><DeskNext /><input type="hidden" name="id" value={i.id} /><button className={ACTION_STOP}>revoke</button></form>}
              </div>
            ))
          )}
        </Section>
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </Reading>
    </>
  );
}
