// ============================================================================
// Circuit breaker for the Anthropic API.
//
// Why: on 2026-09-12 the key ran out of credit and the tick kept calling it —
// 67 failed attempts recorded against one ops alert, and every attempt first
// charged a real team for a call that returned nothing. A key with no credit
// does not recover in seconds, so retrying it every tick is pure waste.
//
// When a failure is of a kind that will not fix itself, the breaker opens and
// calls stop being attempted at all — which also means teams' allowances are
// untouched for the duration, not merely refunded afterwards.
//
// Fails OPEN by design: if the breaker's own state cannot be read, the call
// proceeds. A broken breaker must never be what takes the AI layer down.
// ============================================================================

export const BREAKER_KEY = "ai_breaker";

/** Thrown instead of calling the provider while the breaker is open. */
export class AiProviderDown extends Error {
  constructor(reason: string) {
    super(`ai provider unavailable: ${reason}`);
    this.name = "AiProviderDown";
  }
}

/** How long to stop trying, by failure kind. Pure — unit tested. */
export function breakerMinutes(status: number, body: string): number {
  const credit = status === 400 && /credit balance|too low|billing/i.test(body);
  if (status === 401 || status === 403 || credit) return 15; // needs a human
  if (status === 429) return 2; // provider is throttling us
  if (status >= 500) return 1; // provider wobble
  return 0; // a 4xx we caused — per-call problem, do not open
}

/** Is the recorded breaker still in force? Pure — unit tested. */
export function breakerActive(value: unknown, now = new Date()): { open: boolean; reason: string } {
  const v = (value ?? {}) as { until?: unknown; reason?: unknown };
  if (typeof v.until !== "string") return { open: false, reason: "" };
  const until = Date.parse(v.until);
  if (Number.isNaN(until) || until <= now.getTime()) return { open: false, reason: "" };
  return { open: true, reason: typeof v.reason === "string" ? v.reason : "provider failing" };
}
