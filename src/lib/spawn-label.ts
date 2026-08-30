// ============================================================================
// Child-session labels. A spawned session is named "<parent> · <n>" unless the
// caller picks a name. The parent itself is session 1, so children start at 2;
// gaps left by revoked children are refilled (stable, predictable names).
// Comparison is case-insensitive to match the live-label unique index.
// ============================================================================

const MAX_LABEL = 60;

export function nextLabel(parent: string, taken: string[]): string {
  const t = new Set(taken.map((s) => s.toLowerCase()));
  const base = parent.slice(0, MAX_LABEL - 5); // room for " · NN"
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base} · ${n}`;
    if (!t.has(candidate.toLowerCase())) return candidate;
  }
  throw new Error("no free child label");
}

/** A caller-picked label, normalised the way the index will see it. */
export function cleanLabel(raw: unknown): string | null {
  const s = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, MAX_LABEL);
  return s.length >= 1 ? s : null;
}
