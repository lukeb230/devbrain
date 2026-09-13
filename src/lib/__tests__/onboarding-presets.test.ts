import { describe, expect, it } from "vitest";
import { PRESET_RULES, presetRows, soloGreenDrift } from "@/lib/onboarding-presets";
import { FEATURE_CATALOG, RULES_CATALOG } from "@/lib/rules-catalog";

const on = (rows: { rule: string; enabled: boolean }[]) => rows.filter((r) => r.enabled).map((r) => r.rule).sort();
const off = (rows: { rule: string; enabled: boolean }[]) => rows.filter((r) => !r.enabled).map((r) => r.rule).sort();

describe("presetRows", () => {
  it("writes exactly seven rows, every preset rule, including the false ones", () => {
    for (const p of ["solo", "team"] as const) {
      const rows = presetRows(p, { hasBrainDocs: false });
      expect(rows).toHaveLength(7);
      expect(rows.map((r) => r.rule).sort()).toEqual([...PRESET_RULES].sort());
    }
  });

  it("solo: no_self_approve off, solo_green on", () => {
    const rows = presetRows("solo", { hasBrainDocs: false });
    expect(on(rows)).toEqual(["collision_check", "journals", "no_conflict_pr", "pr_only_main", "solo_green"]);
    expect(off(rows)).toEqual(["brain_updates_required", "no_self_approve"]);
  });

  it("team: no_self_approve on, solo_green off", () => {
    const rows = presetRows("team", { hasBrainDocs: false });
    expect(on(rows)).toEqual(["collision_check", "journals", "no_conflict_pr", "no_self_approve", "pr_only_main"]);
    expect(off(rows)).toEqual(["brain_updates_required", "solo_green"]);
  });

  it("brain_updates_required follows detection, in both presets", () => {
    for (const p of ["solo", "team"] as const) {
      expect(presetRows(p, { hasBrainDocs: true }).find((r) => r.rule === "brain_updates_required")?.enabled).toBe(true);
      expect(presetRows(p, { hasBrainDocs: false }).find((r) => r.rule === "brain_updates_required")?.enabled).toBe(false);
    }
  });

  it("never touches a writer_* switch, and every preset rule exists in the catalogue", () => {
    const known = new Set([...RULES_CATALOG, ...FEATURE_CATALOG].map((c) => c.rule));
    for (const rule of PRESET_RULES) {
      expect(rule.startsWith("writer_")).toBe(false);
      expect(known.has(rule)).toBe(true);
    }
  });
});

describe("soloGreenDrift", () => {
  it("names the repos where solo_green is on", () => {
    const repos = soloGreenDrift([
      { repo_id: "r1", rule: "solo_green", enabled: true },
      { repo_id: "r2", rule: "solo_green", enabled: false },
      { repo_id: "r3", rule: "journals", enabled: true },
    ]);
    expect(repos).toEqual(["r1"]);
  });
});
