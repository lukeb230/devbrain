import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createToken, revokeToken } from "@/app/settings/tokens/actions";
import { COOKIE } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { Button, Card, Empty, Field, PageTitle, Row } from "../ui";

// ============================================================================
// Desk · Tokens & sessions — your dev tokens (mint, shown once, revoke) and
// the spawned sessions under them: child tokens minted by `devbrain spawn`,
// which the panel already folds under their parent as "×N". Stop = revoke
// the child, which ends its sessions and releases its claims (the API does
// that when the token dies). Same two actions as the dashboard's Tokens page.
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

  // RLS: a member sees their own tokens only.
  const { data: tokens } = await supabase.from("dev_tokens").select("id, label, created_at, revoked_at, last_used_at, parent_token_id").order("created_at", { ascending: false });
  const live = (tokens ?? []).filter((t) => !t.revoked_at);
  const roots = live.filter((t) => !t.parent_token_id);
  const childrenOf = (id: string) => live.filter((t) => t.parent_token_id === id);
  const orphans = live.filter((t) => t.parent_token_id && !live.some((p) => p.id === t.parent_token_id));
  const newToken = (await cookies()).get(COOKIE.newToken)?.value;

  return (
    <>
      <PageTitle title="Tokens & sessions" sub="A token is a teammate. One per machine; the Mac app minted its own on first run. Spawned sessions are child tokens of yours." />

      {newToken && (
        <Card title="Your new token — copy it now, it is shown exactly once" className="border-[var(--wg-coral-line)] bg-[var(--wg-coral-deep)]">
          <code className="block select-all break-all rounded-lg border border-line2 bg-ink p-3 font-mono text-[12px] text-txt">{newToken}</code>
          <p className="mt-1.5 text-[11px] text-muted">For a manual, CI or headless setup: <code className="font-mono">devbrain connect --token …</code>. Whoever holds it is that teammate.</p>
        </Card>
      )}

      <Card title="Your tokens" count={roots.length}>
        <form action={createToken} className="mb-2 flex items-center gap-2 border-b border-line pb-2.5">
          <DeskNext />
          <Field name="label" required placeholder="Label — a machine or a person (e.g. Sam's MacBook)" />
          <Button>New token</Button>
        </form>
        {roots.length === 0 ? (
          <Empty>No tokens yet.</Empty>
        ) : (
          roots.map((t) => {
            const kids = childrenOf(t.id);
            return (
              <div key={t.id}>
                <Row
                  title={t.label}
                  sub={`last used ${timeAgo(t.last_used_at)} · created ${timeAgo(t.created_at)}${kids.length ? ` · ${kids.length} spawned session${kids.length === 1 ? "" : "s"}` : ""}`}
                  right={<form action={revokeToken}><DeskNext /><input type="hidden" name="id" value={t.id} /><button className="font-display text-[11.5px] font-semibold text-stop/80 hover:text-stop">revoke</button></form>}
                />
                {kids.map((k) => (
                  <Row
                    key={k.id}
                    className="ml-6"
                    dot={k.last_used_at && Date.now() - new Date(k.last_used_at).getTime() < 15 * 60_000 ? "go" : "dim"}
                    title={<span className="text-muted">↳ {k.label}</span>}
                    sub={`spawned session · last used ${timeAgo(k.last_used_at)}`}
                    right={<form action={revokeToken}><DeskNext /><input type="hidden" name="id" value={k.id} /><button className="font-display text-[11.5px] font-semibold text-muted hover:text-stop" title="Revokes the child token: its sessions end and its claims are released">stop</button></form>}
                  />
                ))}
              </div>
            );
          })
        )}
        {orphans.length > 0 && orphans.map((k) => (
          <Row key={k.id} title={<span className="text-muted">↳ {k.label}</span>} sub={`spawned session (parent revoked) · last used ${timeAgo(k.last_used_at)}`} right={<form action={revokeToken}><DeskNext /><input type="hidden" name="id" value={k.id} /><button className="font-display text-[11.5px] font-semibold text-muted hover:text-stop">stop</button></form>} />
        ))}
        <p className="mt-2 text-[10.5px] text-faint">From a terminal: <code className="font-mono">devbrain spawn</code> mints a child token and opens a fresh clone; <code className="font-mono">devbrain sessions</code> lists them; <code className="font-mono">devbrain stop</code> is the same as Stop here.</p>
      </Card>

      {(tokens ?? []).some((t) => t.revoked_at) && (
        <Card title="Revoked" count={(tokens ?? []).filter((t) => t.revoked_at).length}>
          {(tokens ?? []).filter((t) => t.revoked_at).slice(0, 10).map((t) => <Row key={t.id} title={<span className="text-faint line-through">{t.label}</span>} sub={`revoked ${timeAgo(t.revoked_at)}`} />)}
        </Card>
      )}
    </>
  );
}
