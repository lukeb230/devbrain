import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createToken, revokeToken } from "@/app/settings/tokens/actions";
import { COOKIE } from "@/lib/cookies";
import { teamHints } from "@/lib/desk/team-hints";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { Copy } from "../copy";
import { DeskNext } from "../desk-next";
import { Reading, TeamPane } from "../panes";
import { ACTION_MUTED, ACTION_STOP, Button, Dot, Empty, Field } from "../ui";

// ============================================================================
// Desk · Tokens & sessions (Dusk) — the shown-once token card, label + New
// token, root tokens with their spawned children indented, the terminal
// footnote, the revoked line. Stop = revoke the child, which ends its
// sessions and releases its claims.
// ============================================================================

export const dynamic = "force-dynamic";

function timeAgo(iso: string | null) {
  if (!iso) return "never";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DeskTokens() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");

  const [{ data: tokens }, hints] = await Promise.all([
    supabase.from("dev_tokens").select("id, label, created_at, revoked_at, last_used_at, parent_token_id").order("created_at", { ascending: false }),
    teamHints(org.orgId, user.id, null),
  ]);
  const live = (tokens ?? []).filter((t) => !t.revoked_at);
  const roots = live.filter((t) => !t.parent_token_id);
  const childrenOf = (id: string) => live.filter((t) => t.parent_token_id === id);
  const orphans = live.filter((t) => t.parent_token_id && !live.some((p) => p.id === t.parent_token_id));
  const revoked = (tokens ?? []).filter((t) => t.revoked_at);
  const newToken = (await cookies()).get(COOKIE.newToken)?.value;
  const rows = [...roots.flatMap((t) => [t, ...childrenOf(t.id)]), ...orphans];

  return (
    <>
      <TeamPane current="tokens" hints={hints} />
      <Reading>
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Tokens &amp; sessions</h1>
        <p className="mt-2 max-w-[600px] text-[13px] leading-[1.6] text-muted">A token is a teammate. One per machine; the Mac app minted its own on first run. Spawned sessions are child tokens of yours.</p>

        {newToken && (
          <div className="mt-6 rounded-xl border border-coralline bg-coralink px-5 py-[18px]">
            <div className="font-mono text-[10px] uppercase tracking-[.12em] text-accent">Your new token — copy it now, it is shown exactly once</div>
            <code className="mt-2 block select-all break-all font-mono text-[13px] leading-[1.6] text-txt">{newToken}</code>
            <div className="mt-2.5 flex items-center gap-3">
              <Copy text={newToken} label="Copy" tone="button" />
              <p className="text-[12px] text-accent">For a manual, CI or headless setup: <code className="font-mono">devbrain connect --token …</code>. Whoever holds it is that teammate.</p>
            </div>
          </div>
        )}

        <section className="mt-7">
          <form action={createToken} className="flex gap-2">
            <DeskNext />
            <Field name="label" required placeholder="Label — a machine or a person (e.g. Sam's MacBook)" className="min-w-0 flex-1" />
            <Button size="lg">New token</Button>
          </form>
          {rows.length === 0 && <Empty className="mt-3.5 border-t border-line">No tokens yet.</Empty>}
          <div className="mt-3.5">
            {rows.map((t, i) => {
              const child = Boolean(t.parent_token_id);
              const kids = child ? [] : childrenOf(t.id);
              const recent = t.last_used_at && Date.now() - new Date(t.last_used_at).getTime() < 15 * 60_000;
              return (
                <div key={t.id} className={`flex items-center gap-3.5 border-t border-line ${child ? "py-2.5 pl-7" : "py-3.5"} ${i === rows.length - 1 ? "border-b" : ""}`}>
                  {child && <Dot level={recent ? "go" : "dim"} size={8} glow={false} />}
                  <div className="flex-1">
                    <div className={child ? "text-[13.5px] text-muted" : "text-[14px] text-txt"}>{child ? `↳ ${t.label}` : t.label}</div>
                    <div className={`mt-0.5 text-[12px] ${child ? "text-faint" : "text-muted"}`}>
                      {child ? `spawned session${live.some((p) => p.id === t.parent_token_id) ? "" : " (parent revoked)"} · last used ${timeAgo(t.last_used_at)}` : `last used ${timeAgo(t.last_used_at)} · created ${timeAgo(t.created_at)}${kids.length ? ` · ${kids.length} spawned session${kids.length === 1 ? "" : "s"}` : ""}`}
                    </div>
                  </div>
                  <form action={revokeToken}><DeskNext /><input type="hidden" name="id" value={t.id} /><button className={child ? ACTION_MUTED : ACTION_STOP} title={child ? "Revokes the child token: its sessions end and its claims are released" : undefined}>{child ? "stop" : "revoke"}</button></form>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-[12px] leading-[1.6] text-faint">From a terminal: <code className="font-mono">devbrain spawn</code> mints a child token and opens a fresh clone; <code className="font-mono">devbrain sessions</code> lists them; <code className="font-mono">devbrain stop</code> is the same as Stop here.</p>
          {revoked.length > 0 && (
            <p className="mt-5 text-[12.5px] text-faint">
              <span className="font-mono text-[10px] uppercase tracking-[.1em]">revoked · {revoked.length}</span>
              {revoked.slice(0, 6).map((t) => <span key={t.id}> &nbsp; <span className="line-through">{t.label}</span> · {timeAgo(t.revoked_at)}</span>)}
            </p>
          )}
        </section>
      </Reading>
    </>
  );
}
