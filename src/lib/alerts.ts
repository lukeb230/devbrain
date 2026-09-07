import { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Alerts — one call for "something is wrong", two audiences, one delivery.
//   scope {orgId}    → that team's owners/admins
//   scope "ops"      → the operator (the team named in system_state.operator)
//
// Delivery is the alert_log row itself. The Mac app subscribes to alert_log
// over Supabase realtime (RLS-scoped: members see their team's rows, the
// operator's team also sees org_id-null rows) and shows a native macOS
// notification the moment a row is inserted, re-notified, or recovered.
// There are no webhooks, no chat integrations, no outbound HTTP here.
//
// Dedupe: one open alert_log row per (scope, key). First occurrence inserts
// (→ notification); repeats bump `count` and stamp last_notified_at at most
// every THROTTLE_MS (→ "still failing" notification). resolve() closes the
// row with resolved_by 'system' (→ "recovered" notification) or a person's
// name (dismissed — silent). Never throws — alerting must not be a new way
// to fail.
// ============================================================================

export type AlertScope = "ops" | { orgId: string };
export type Severity = "info" | "warn" | "error";
export type AlertInput = { scope: AlertScope; key: string; title: string; detail?: string; severity?: Severity };

const THROTTLE_MS = 6 * 3600_000;
const NIL = "00000000-0000-0000-0000-000000000000";

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
      await admin.from("alert_log").insert({
        org_id: orgId, key: input.key, severity: sev, title: input.title, detail: input.detail?.slice(0, 2000) ?? null,
        last_notified_at: now.toISOString(),
      });
      // A unique-index conflict here means another writer raced us and its
      // row is the one that notified — nothing to do.
      return;
    }
    const due = !open.last_notified_at || now.getTime() - new Date(open.last_notified_at).getTime() > THROTTLE_MS;
    await admin
      .from("alert_log")
      .update({ count: open.count + 1, last_seen: now.toISOString(), detail: input.detail?.slice(0, 2000) ?? null, ...(due ? { last_notified_at: now.toISOString() } : {}) })
      .eq("id", open.id);
  } catch (e) {
    console.warn("alert() failed", String(e).slice(0, 120));
  }
}

/** Close the open alert for (scope, key) if any. `by` "system" = recovered
 *  (the app announces it); a person's name = dismissed (silent). */
export async function resolve(scope: AlertScope, key: string, by = "system"): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const orgId = scope === "ops" ? null : scope.orgId;
    const q = admin.from("alert_log").select("id").eq("key", key).is("resolved_at", null);
    const { data: open } = orgId ? await q.eq("org_id", orgId).maybeSingle() : await q.is("org_id", null).maybeSingle();
    if (!open) return;
    await admin.from("alert_log").update({ resolved_at: new Date().toISOString(), resolved_by: by }).eq("id", open.id);
  } catch { /* never throw */ }
}

/** The team that operates this deployment: its admins also see ops alerts.
 *  system_state key 'operator' = {"org_id": "<uuid>"}; unset = nobody. */
export async function operatorOrgId(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin().from("system_state").select("value").eq("key", "operator").maybeSingle();
    const id = (data?.value as { org_id?: string } | null)?.org_id;
    return id && id !== NIL ? id : null;
  } catch {
    return null;
  }
}

export interface OpenAlert {
  id: string;
  key: string;
  severity: string;
  title: string;
  detail: string | null;
  count: number;
  first_seen: string;
  last_seen: string;
  /** true for operator (org_id null) rows shown to the operator's team */
  ops: boolean;
}

/** Open alerts for a team, for the in-app banner — plus the deployment's ops
 *  alerts when this team is the operator. */
export async function openAlerts(orgId: string): Promise<OpenAlert[]> {
  const admin = supabaseAdmin();
  const cols = "id, key, severity, title, detail, count, first_seen, last_seen";
  const isOperator = (await operatorOrgId()) === orgId;
  const [{ data: team }, ops] = await Promise.all([
    admin.from("alert_log").select(cols).eq("org_id", orgId).is("resolved_at", null).order("last_seen", { ascending: false }).limit(10),
    isOperator
      ? admin.from("alert_log").select(cols).is("org_id", null).is("resolved_at", null).order("last_seen", { ascending: false }).limit(10)
      : Promise.resolve({ data: [] as OpenAlert[] }),
  ]);
  return [
    ...((team ?? []) as Omit<OpenAlert, "ops">[]).map((a) => ({ ...a, ops: false })),
    ...(((ops.data ?? []) as Omit<OpenAlert, "ops">[]).map((a) => ({ ...a, ops: true }))),
  ].sort((a, b) => (a.last_seen < b.last_seen ? 1 : -1));
}

export { NIL as OPS_NIL };
