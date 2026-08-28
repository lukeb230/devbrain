import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Alerts — one call for "something is wrong", two audiences.
//   scope "ops"      → the operator (DEVBRAIN_OPS_WEBHOOK env or an
//                      alert_channels row with org_id null)
//   scope {orgId}    → that team's owners/admins (in-app always; webhook when
//                      the team added one on Settings → Team)
// Dedupe: one open alert_log row per (scope, key). First occurrence notifies
// now; repeats bump `count` and re-notify at most every THROTTLE_MS. resolve()
// closes the row and sends a one-line "recovered". Never throws — alerting
// must not be a new way to fail.
// ============================================================================

export type AlertScope = "ops" | { orgId: string };
export type Severity = "info" | "warn" | "error";
export type AlertInput = { scope: AlertScope; key: string; title: string; detail?: string; severity?: Severity };

const THROTTLE_MS = 6 * 3600_000;
const NIL = "00000000-0000-0000-0000-000000000000";

type Channel = { kind: string; target: string };

async function channelsFor(scope: AlertScope): Promise<Channel[]> {
  const admin = supabaseAdmin();
  const out: Channel[] = [];
  if (scope === "ops" && process.env.DEVBRAIN_OPS_WEBHOOK) out.push({ kind: "webhook", target: process.env.DEVBRAIN_OPS_WEBHOOK });
  const q = admin.from("alert_channels").select("kind, target").eq("enabled", true);
  const { data } = scope === "ops" ? await q.is("org_id", null) : await q.eq("org_id", scope.orgId);
  for (const c of data ?? []) if (!out.some((o) => o.target === c.target)) out.push(c);
  return out;
}

// ---- adapters ---------------------------------------------------------------
// Slack and Discord incoming webhooks accept slightly different JSON; pick by
// host. Anything else gets a generic {title, detail, severity} body.
async function deliverWebhook(target: string, sev: Severity, title: string, detail: string | undefined, scopeLabel: string) {
  const icon = sev === "error" ? "🔴" : sev === "warn" ? "🟠" : "🟢";
  const line = `${icon} DevBrain · ${scopeLabel} · ${title}${detail ? `\n${detail}` : ""}`;
  let body: unknown;
  if (/discord(app)?\.com\/api\/webhooks/.test(target)) body = { content: line.slice(0, 1900) };
  else if (/hooks\.slack\.com/.test(target)) body = { text: line.slice(0, 3000) };
  else body = { source: "devbrain", scope: scopeLabel, severity: sev, title, detail };
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 5000);
  try {
    await fetch(target, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

const ADAPTERS: Record<string, (target: string, sev: Severity, title: string, detail: string | undefined, scopeLabel: string) => Promise<void>> = {
  webhook: deliverWebhook,
  // email: … (later — add an adapter, insert an alert_channels row with kind 'email')
};

async function notify(scope: AlertScope, sev: Severity, title: string, detail?: string) {
  const scopeLabel = scope === "ops" ? "ops" : "team";
  const channels = await channelsFor(scope);
  await Promise.all(
    channels.map(async (c) => {
      const fn = ADAPTERS[c.kind];
      if (!fn) return;
      try { await fn(c.target, sev, title, detail, scopeLabel); } catch (e) { console.warn("alert delivery failed", c.kind, String(e).slice(0, 120)); }
    }),
  );
}

// ---- public API -------------------------------------------------------------
export async function alert(input: AlertInput): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const orgId = input.scope === "ops" ? null : input.scope.orgId;
    const sev = input.severity ?? "error";
    const now = new Date();
    const q = admin.from("alert_log").select("id, count, last_notified_at").eq("key", input.key).is("resolved_at", null);
    const { data: open } = orgId ? await q.eq("org_id", orgId).maybeSingle() : await q.is("org_id", null).maybeSingle();
    if (!open) {
      const { error } = await admin.from("alert_log").insert({
        org_id: orgId, key: input.key, severity: sev, title: input.title, detail: input.detail?.slice(0, 2000) ?? null,
        last_notified_at: now.toISOString(),
      });
      if (error) return; // raced with another writer — it notified
      await notify(input.scope, sev, input.title, input.detail);
      return;
    }
    const due = !open.last_notified_at || now.getTime() - new Date(open.last_notified_at).getTime() > THROTTLE_MS;
    await admin
      .from("alert_log")
      .update({ count: open.count + 1, last_seen: now.toISOString(), detail: input.detail?.slice(0, 2000) ?? null, ...(due ? { last_notified_at: now.toISOString() } : {}) })
      .eq("id", open.id);
    if (due) await notify(input.scope, sev, `${input.title} (still failing, ×${open.count + 1})`, input.detail);
  } catch (e) {
    console.warn("alert() failed", String(e).slice(0, 120));
  }
}

/** Close the open alert for (scope, key) if any, and say so. */
export async function resolve(scope: AlertScope, key: string, by = "system"): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const orgId = scope === "ops" ? null : scope.orgId;
    const q = admin.from("alert_log").select("id, title").eq("key", key).is("resolved_at", null);
    const { data: open } = orgId ? await q.eq("org_id", orgId).maybeSingle() : await q.is("org_id", null).maybeSingle();
    if (!open) return;
    await admin.from("alert_log").update({ resolved_at: new Date().toISOString(), resolved_by: by }).eq("id", open.id);
    if (by === "system") await notify(scope, "info", `recovered: ${open.title}`);
  } catch { /* never throw */ }
}

/** Open alerts for a team, for the in-app banner. */
export async function openAlerts(orgId: string) {
  const { data } = await supabaseAdmin()
    .from("alert_log")
    .select("id, key, severity, title, detail, count, first_seen, last_seen")
    .eq("org_id", orgId)
    .is("resolved_at", null)
    .order("last_seen", { ascending: false })
    .limit(10);
  return data ?? [];
}

export { NIL as OPS_NIL };
