import { describe, expect, it } from "vitest";
import { tokenInsertOutcome } from "@/lib/token-mint";

describe("tokenInsertOutcome", () => {
  it("no error means the row was written", () => {
    expect(tokenInsertOutcome(null)).toEqual({ ok: true });
    expect(tokenInsertOutcome(undefined)).toEqual({ ok: true });
  });
  it("a unique violation is a taken label", () => {
    expect(tokenInsertOutcome({ code: "23505", message: 'duplicate key value violates unique constraint "dev_tokens_live_label_per_user"' })).toEqual({ ok: false, notice: "token_label_taken" });
  });
  it("any other error is a generic failure", () => {
    expect(tokenInsertOutcome({ code: "42501", message: "permission denied" })).toEqual({ ok: false, notice: "token_failed" });
    expect(tokenInsertOutcome({ message: "network" })).toEqual({ ok: false, notice: "token_failed" });
  });
});
