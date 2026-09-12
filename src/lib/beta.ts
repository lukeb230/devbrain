// ============================================================================
// The free beta.
//
// One row — system_state.beta — decides three things:
//   free         new teams are created comped, and existing teams that never
//                subscribed are treated as comped, so nobody sees the plan
//                wall while the beta runs
//   max_teams    how many teams may exist before signups close
//   max_members  how many distinct people may be on those teams
//
// Turning the beta off is that one row. Teams created during it keep
// orgs.beta = true and stay comped until they are deliberately converted —
// ending the beta must never wall the people who showed up for it.
//
// The caps exist because DevBrain's costs are real: every team gets an AI
// budget, and the platform's global daily ceiling is shared. A cap is a
// closed door with a message; an uncapped launch is a bill.
// ============================================================================

import { supabaseAdmin } from "@/lib/supabase/server";
import { LEGAL } from "@/lib/legal";

export interface BetaState {
  free: boolean;
  maxTeams: number | null;
  maxMembers: number | null;
  /** Announced end of the free beta, so teams are told before it happens. */
  endsAt: string | null;
}

export const BETA_OFF: BetaState = { free: false, maxTeams: null, maxMembers: null, endsAt: null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

let cached: { at: number; value: BetaState } | null = null;

/** The beta record. Cached for 30 s: it is read on every Console render and
 *  changes about once a quarter. Pass fresh=true where the answer gates an
 *  irreversible decision (creating a team, joining one). */
export async function loadBeta(fresh = false): Promise<BetaState> {
  if (!fresh && cached && Date.now() - cached.at < 30_000) return cached.value;
  const { data } = await supabaseAdmin().from("system_state").select("value").eq("key", "beta").maybeSingle();
  const v = (data?.value ?? {}) as Record<string, unknown>;
  const endsAt = typeof v.ends_at === "string" && !Number.isNaN(Date.parse(v.ends_at)) ? v.ends_at : null;
  const value: BetaState = { free: v.free === true, maxTeams: num(v.max_teams), maxMembers: num(v.max_members), endsAt };
  cached = { at: Date.now(), value };
  return value;
}

/** Does the free beta cover this team? The rule in one place, because three
 *  surfaces ask it and they must agree: a team that never subscribed is free
 *  (including one created before the switch, still "trialing" in the
 *  database), and a team with a live Stripe subscription is left alone —
 *  Stripe is the authority on what someone is actually paying for. */
export function coversTeam(beta: BetaState, team: { status: string; hasSubscription: boolean }): boolean {
  return beta.free && !team.hasSubscription && team.status !== "active";
}

export interface PlatformCounts {
  teams: number;
  members: number;
}

export async function platformCounts(): Promise<PlatformCounts> {
  const { data } = await supabaseAdmin().rpc("platform_counts");
  const row = (Array.isArray(data) ? data[0] : data) as { teams?: number; members?: number } | null;
  return { teams: Number(row?.teams ?? 0), members: Number(row?.members ?? 0) };
}

export const FULL_MESSAGE = `DevBrain's beta is full right now. Ask for a spot at ${LEGAL.contact}.`;

/** Pure: is there room for one more? `joining` counts a person coming in on
 *  an invite (no new team), `creating` counts a brand-new team. */
export function hasRoom(beta: BetaState, counts: PlatformCounts, what: "team" | "member"): boolean {
  if (what === "team" && beta.maxTeams !== null && counts.teams >= beta.maxTeams) return false;
  if (beta.maxMembers !== null && counts.members >= beta.maxMembers) return false;
  return true;
}

/** null when there is room, else the message to show. A full beta raises one
 *  ops alert a day: a closed door nobody knows about is a silent outage. */
export async function signupBlock(what: "team" | "member"): Promise<string | null> {
  const beta = await loadBeta(true);
  if (beta.maxTeams === null && beta.maxMembers === null) return null;
  const counts = await platformCounts();
  if (hasRoom(beta, counts, what)) return null;
  const { alert } = await import("@/lib/alerts");
  await alert({
    scope: "ops",
    key: `beta.full.${new Date().toISOString().slice(0, 10)}`,
    severity: "warn",
    title: "The beta is full — signups are closed",
    detail: `${counts.teams} teams and ${counts.members} people, against a cap of ${beta.maxTeams ?? "∞"} teams and ${beta.maxMembers ?? "∞"} people. Raise system_state.beta.max_teams / max_members to let more in.`,
  });
  return FULL_MESSAGE;
}
