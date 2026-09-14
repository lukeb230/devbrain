// The one thing createToken must never do is show a token it did not store.
// Postgres reports a unique-index violation as SQLSTATE 23505; the index that
// fires here is dev_tokens_live_label_per_user (one live label per user).
export type TokenInsertOutcome = { ok: true } | { ok: false; notice: "token_label_taken" | "token_failed" };

export function tokenInsertOutcome(error: { code?: string | null; message?: string } | null | undefined): TokenInsertOutcome {
  if (!error) return { ok: true };
  if (error.code === "23505") return { ok: false, notice: "token_label_taken" };
  return { ok: false, notice: "token_failed" };
}
