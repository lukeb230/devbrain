import { describe, expect, it } from "vitest";
import { missingEnv, RECOMMENDED_ENV, REQUIRED_ENV } from "@/lib/env";

const full = Object.fromEntries([...REQUIRED_ENV, ...RECOMMENDED_ENV].map((k) => [k, "x"]));

describe("missingEnv", () => {
  it("reports nothing when everything is set", () => {
    expect(missingEnv(full)).toEqual({ required: [], recommended: [] });
  });

  it("names a missing required variable", () => {
    const env = { ...full, DEVBRAIN_GH_WEBHOOK_SECRET: undefined };
    expect(missingEnv(env).required).toEqual(["DEVBRAIN_GH_WEBHOOK_SECRET"]);
  });

  it("treats whitespace as missing", () => {
    const env = { ...full, DEVBRAIN_CRON_SECRET: "   " };
    expect(missingEnv(env).required).toEqual(["DEVBRAIN_CRON_SECRET"]);
  });

  it("keeps recommended separate from required", () => {
    const env = { ...full, DEVBRAIN_OPS_WEBHOOK: "" };
    const m = missingEnv(env);
    expect(m.required).toEqual([]);
    expect(m.recommended).toEqual(["DEVBRAIN_OPS_WEBHOOK"]);
  });
});
