// ============================================================================
// The collision guard's decision, server-side.
//
// Before every file-changing tool call, the plugin's PreToolUse hook asks
// POST /api/v1/guard whether a teammate is on this file right now. The
// comparison used to live in the hook; it is here so the warn can be
// RECORDED in the same round trip (an `events` row of kind
// collision_warned) and so it can be tested without a database.
//
// "Someone else" means another label. Your own other windows and hosts share
// your label and are not teammates; a spawned session has its own label.
//
// The outcome rule is deliberately modest: a warn followed by an edit to the
// same file by the same session within GUARD_EDIT_WINDOW_MS is "edited after".
// That is a fact, not a verdict — the person may have coordinated first. We
// report warned and edited_after as two numbers and never call either one
// "prevented".
// ============================================================================

export const GUARD_EDIT_WINDOW_MS = 10 * 60_000;

export type GuardSession = { id: string; dev: string; branch: string | null; files: string[] };
export type GuardClaim = { id: string; dev_label: string; paths: string[]; note: string | null };
export type GuardWith = { label: string; via: "session" | "claim"; id: string };

export type GuardDecision = {
  warn: boolean;
  with: GuardWith[];
  /** The sentence the hook shows; empty when warn is false. */
  reason: string;
};

function claimCovers(path: string, rel: string): boolean {
  return rel === path || rel.startsWith(String(path).replace(/\*+$/, ""));
}

export function guardDecision(i: { you: string; ownSession: string; rel: string; sessions: GuardSession[]; claims: GuardClaim[] }): GuardDecision {
  const others = i.sessions.filter((s) => String(s.id) !== i.ownSession && s.dev !== i.you && s.files.includes(i.rel));
  const claimed = i.claims.filter((c) => c.dev_label !== i.you && (c.paths ?? []).some((p) => claimCovers(p, i.rel)));
  if (others.length === 0 && claimed.length === 0) return { warn: false, with: [], reason: "" };

  const who = [
    ...others.map((s) => `${s.dev} (active session${s.branch ? ` on ${s.branch}` : ""})`),
    ...claimed.map((c) => `${c.dev_label} (claimed${c.note ? `: ${c.note}` : ""})`),
  ].join(", ");
  return {
    warn: true,
    with: [
      ...others.map((s): GuardWith => ({ label: s.dev, via: "session", id: String(s.id) })),
      ...claimed.map((c): GuardWith => ({ label: c.dev_label, via: "claim", id: String(c.id) })),
    ],
    reason: `DevBrain: ${i.rel} is being worked on right now by ${who}. Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.`,
  };
}

export type GuardWarn = { id: number; at: string; actor_session: string | null; rel: string };
export type GuardActivity = { session_id: string | null; file: string; at: string };

/** Two honest counts over a set of warns: how many fired, and how many were
 *  followed by an edit to that file by that session inside the window. */
export function guardOutcomes(warns: GuardWarn[], activity: GuardActivity[], windowMs = GUARD_EDIT_WINDOW_MS): { warned: number; edited_after: number } {
  let edited_after = 0;
  for (const w of warns) {
    if (!w.actor_session) continue;
    const at = Date.parse(w.at);
    const followed = activity.some((a) => a.session_id === w.actor_session && a.file === w.rel && Date.parse(a.at) > at && Date.parse(a.at) - at <= windowMs);
    if (followed) edited_after += 1;
  }
  return { warned: warns.length, edited_after };
}
