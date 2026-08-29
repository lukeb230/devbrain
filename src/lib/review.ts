// ============================================================================
// Review verdict — a conclusion drawn from the findings, not taken on trust.
//
// The model proposes a verdict, but a verdict that never varies carries no
// signal: early reviews came back "caution" on PRs whose own points listed
// zero risks, which by the review prompt's own definition are not "worth a
// careful human look". So the verdict is derived from the points the review
// actually made:
//
//   risky      — the model's call; severity is the one judgement only it makes
//   caution    — at least one risk point, or a team-rule (brain) point
//   looks_good — no risk points, however many suggestions
//
// Suggestions never downgrade a verdict. An unparseable response stays
// "caution": a parse failure is a genuine unknown, not a clean bill of health.
//
// Deriving here rather than in the route also lets the deterministic brain-rule
// point reach the verdict — it is appended after the model has answered, so a
// model-supplied verdict could never reflect it.
// ============================================================================

export type Verdict = "looks_good" | "caution" | "risky";

export interface ReviewPoint {
  kind: "risk" | "suggestion" | "brain";
  text: string;
}

export function deriveVerdict(parsed: { verdict?: unknown } | null, points: ReviewPoint[]): Verdict {
  if (!parsed) return "caution";
  if (parsed.verdict === "risky") return "risky";
  if (points.some((p) => p.kind === "risk" || p.kind === "brain")) return "caution";
  return "looks_good";
}
