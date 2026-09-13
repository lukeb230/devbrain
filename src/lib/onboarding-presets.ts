// ============================================================================
// The two first-run presets. Both write ALL seven rows explicitly — including
// the false ones — so "decided" is distinguishable from "never saw it".
// The three writer_* switches are deliberately absent: granting DevBrain
// write access to a repo is a decision for the Rules page, not minute three.
// ============================================================================

export type Preset = "solo" | "team";

export const PRESET_RULES = [
  "collision_check",
  "pr_only_main",
  "no_conflict_pr",
  "journals",
  "no_self_approve",
  "solo_green",
  "brain_updates_required",
] as const;
export type PresetRule = (typeof PRESET_RULES)[number];

const TABLE: Record<Preset, Record<Exclude<PresetRule, "brain_updates_required">, boolean>> = {
  solo: { collision_check: true, pr_only_main: true, no_conflict_pr: true, journals: true, no_self_approve: false, solo_green: true },
  team: { collision_check: true, pr_only_main: true, no_conflict_pr: true, journals: true, no_self_approve: true, solo_green: false },
};

export function presetRows(preset: Preset, opts: { hasBrainDocs: boolean }): { rule: PresetRule; enabled: boolean }[] {
  return PRESET_RULES.map((rule) => ({
    rule,
    enabled: rule === "brain_updates_required" ? opts.hasBrainDocs : TABLE[preset][rule],
  }));
}

/** Repos where solo_green is on — a team that just grew should be told. */
export function soloGreenDrift(policies: { repo_id: string; rule: string; enabled: boolean }[]): string[] {
  return policies.filter((p) => p.rule === "solo_green" && p.enabled).map((p) => p.repo_id);
}
