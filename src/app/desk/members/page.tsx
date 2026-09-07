import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createInvite, removeMember, revokeInvite, setRole } from "@/app/settings/members/actions";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseAdmin } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { Button, Card, Empty, PageTitle, Row, Select } from "../ui";

// ============================================================================
// Desk · Members — roles (owner / admin / member), remove, and invite links
// (create with role + single-use, copy, revoke). Same four actions as the
// dashboard's Members page. Owners change roles and remove; admins invite.
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
const act = "font-display text-[11.5px] font-semibold text-brand-400 hover:underline";

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
    admin.from("sessions").select("dev_label, last_seen").eq("org_id", me.orgId).order("last_seen", { ascending: false }).limit(200),
  ]);
  const lastSeen = new Map<string, string>();
  for (const s of sessions ?? []) {
    const k = String(s.dev_label || "").toLowerCase();
    if (k && !lastSeen.has(k)) lastSeen.set(k, s.last_seen);
  }
  const owners = (members ?? []).filter((m) => m.role === "owner").length;

  return (
    <>
      <PageTitle title="Members" sub={`${me.orgName} · ${members?.length ?? 0} people · invite links add someone with one click: they sign in with GitHub, install the app, and they're in`} />

      <Card title="People" count={members?.length ?? 0}>
        {(members ?? []).map((m) => {
          const login = String(m.github_login || "");
          const seen = lastSeen.get(login.toLowerCase());
          const self = m.user_id === me.userId;
          const lastOwner = m.role === "owner" && owners <= 1;
          return (
            <Row
              key={m.user_id}
              title={<span className={self ? "text-brand-400" : ""}>{login || "(no GitHub login)"}{self ? " · you" : ""}</span>}
              sub={`${seen ? `last seen ${timeAgo(seen)}` : "never seen in a session"} · joined ${timeAgo(m.created_at)}`}
              right={
                isOwner && !self ? (
                  <>
                    <form action={setRole} className="flex items-center gap-1">
                      <DeskNext /><input type="hidden" name="userId" value={m.user_id} />
                      <Select name="role" defaultValue={m.role}><option value="owner">owner</option><option value="admin">admin</option><option value="member">member</option></Select>
                      <button className={act}>set</button>
                    </form>
                    <form action={removeMember}><DeskNext /><input type="hidden" name="userId" value={m.user_id} /><button className="font-display text-[11.5px] font-semibold text-stop/80 hover:text-stop" title={lastOwner ? "The last owner can't be removed" : undefined} disabled={lastOwner}>remove</button></form>
                  </>
                ) : (
                  <span className="rounded-full border border-line2 px-2 py-0.5 font-mono text-[10px] text-muted">{m.role}</span>
                )
              }
            />
          );
        })}
        <p className="mt-2 text-[10.5px] text-faint">owner manages roles, members and the team itself · admin also mints invites, links repos, edits rules and maps Reminders · member does everything else.</p>
      </Card>

      <Card title="Invite links" count={invites?.length ?? 0} right="expire after 7 days">
        {isAdmin && (
          <form action={createInvite} className="mb-2 flex items-center gap-2 border-b border-line pb-2.5 text-[12px]">
            <DeskNext />
            <Select name="role" defaultValue="member"><option value="member">member</option><option value="admin">admin</option></Select>
            <label className="flex items-center gap-1.5 text-muted"><input type="checkbox" name="single" /> single-use</label>
            <span className="flex-1" />
            <Button>New invite link</Button>
          </form>
        )}
        {!invites || invites.length === 0 ? (
          <Empty>No active invite links.</Empty>
        ) : (
          invites.map((i) => (
            <Row
              key={i.id}
              title={<code className="select-all font-mono text-[11.5px] text-[var(--wg-code)]">{origin}/join/{i.code}</code>}
              sub={`${i.role} · ${i.max_uses === 1 ? (i.uses >= 1 ? "used" : "single-use") : `used ${i.uses}×`} · by ${i.created_by} · expires in ${Math.max(1, Math.round((new Date(i.expires_at).getTime() - Date.now()) / 86_400_000))}d`}
              right={isAdmin && <form action={revokeInvite}><DeskNext /><input type="hidden" name="id" value={i.id} /><button className="font-display text-[11.5px] font-semibold text-stop/80 hover:text-stop">revoke</button></form>}
            />
          ))
        )}
      </Card>
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
