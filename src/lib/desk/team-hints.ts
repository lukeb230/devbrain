import { loadBeta } from "@/lib/beta";
import { supabaseAdmin } from "@/lib/supabase/server";

// The one-word hints on the Team group's list pane (Dusk): repo for Rules,
// member count, live token count, AI usage %, mapped list count, health.
// One cheap query set; every Team page calls it.

export type TeamHints = Partial<Record<"rules" | "members" | "tokens" | "team" | "plan" | "reminders" | "mac", { text: string; tone?: "muted" | "wait" | "go" }>>;

export async function teamHints(orgId: string, userId: string, repoName: string | null): Promise<TeamHints> {
  const admin = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);
  const [{ count: members }, { count: tokens }, { data: orgRow }, { data: usage }, { count: lists }, { data: tick }] = await Promise.all([
    admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("dev_tokens").select("id", { count: "exact", head: true }).eq("org_id", orgId).eq("user_id", userId).is("revoked_at", null).is("parent_token_id", null),
    admin.from("orgs").select("ai_daily_cap, plan, billing_status, trial_ends_at, stripe_subscription_id").eq("id", orgId).single(),
    admin.from("ai_usage").select("calls").eq("org_id", orgId).eq("day", today).maybeSingle(),
    admin.from("reminder_sources").select("id", { count: "exact", head: true }).eq("org_id", orgId),
    admin.from("system_state").select("updated_at").eq("key", "last_tick").maybeSingle(),
  ]);
  const cap = orgRow?.ai_daily_cap ?? 0;
  const pct = cap > 0 ? Math.min(100, Math.round(((usage?.calls ?? 0) / cap) * 100)) : 0;
  const tickOk = tick?.updated_at ? Date.now() - new Date(tick.updated_at).getTime() < 600_000 : false;
  const trialDays = orgRow?.billing_status === "trialing" && orgRow.trial_ends_at ? Math.max(0, Math.ceil((new Date(orgRow.trial_ends_at).getTime() - Date.now()) / 86_400_000)) : null;
  // Mirrors loadBilling: while the beta is free, a team that never subscribed
  // reads as free, whatever the row says.
  const betaFree = (await loadBeta()).free && !orgRow?.stripe_subscription_id && orgRow?.billing_status !== "active";
  const planText = betaFree ? "free beta" : orgRow?.billing_status === "comped" ? "comped" : orgRow?.billing_status === "trialing" ? (trialDays === null ? "trial" : `trial · ${trialDays}d`) : orgRow?.billing_status === "past_due" ? "payment failed" : orgRow?.billing_status === "canceled" ? "canceled" : orgRow?.plan === "scale" ? "Scale" : "Base";
  return {
    plan: { text: planText, tone: betaFree ? "muted" : orgRow?.billing_status === "past_due" || orgRow?.billing_status === "canceled" || (trialDays !== null && trialDays <= 2) ? "wait" : "muted" },
    rules: repoName ? { text: repoName.split("/").pop() ?? repoName } : undefined,
    members: { text: String(members ?? 0) },
    tokens: { text: String(tokens ?? 0) },
    team: { text: `AI ${pct}%`, tone: pct >= 80 ? "wait" : "muted" },
    reminders: { text: `${lists ?? 0} list${lists === 1 ? "" : "s"}` },
    mac: { text: tickOk ? "healthy" : "check", tone: tickOk ? "go" : "wait" },
  };
}
