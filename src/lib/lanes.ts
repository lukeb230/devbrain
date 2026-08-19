// ============================================================================
// Task lanes — pure helpers for the dispatcher. No AI, no network.
// A "lane" is the set of path prefixes a dev is working in: their active
// claims plus the footprints of tasks they've started.
// ============================================================================

/** Prefix-style overlap: "src/auth/" vs "src/auth/login.ts" → true. */
export function pathsOverlap(a: string, b: string): boolean {
  const na = a.trim().replace(/^\.\//, "");
  const nb = b.trim().replace(/^\.\//, "");
  if (!na || !nb) return false;
  return na === nb || na.startsWith(nb) || nb.startsWith(na);
}

export function footprintsCollide(a: string[], b: string[]): boolean {
  return a.some((pa) => b.some((pb) => pathsOverlap(pa, pb)));
}

export interface LaneTask {
  id: string;
  title: string;
  priority: number;
  tags: string[];
  assigned_to: string | null;
  started_by: string | null;
  footprint: string[] | null;
  created_at: string;
}

export interface SuggestedNext {
  id: string;
  title: string;
  priority: number;
  footprint: string[] | null;
  reason: string;
}

/**
 * Pick the best next task for `you`:
 *   - open, not started by anyone else, assigned to you or unassigned
 *   - lane-safe: its footprint doesn't overlap OTHER devs' busy paths
 *   - assigned-to-you beats unassigned; then priority; then age
 * Tasks with no footprint yet are eligible but flagged in the reason.
 */
export function pickSuggestedNext(
  tasks: LaneTask[],
  you: string,
  othersBusyPaths: string[],
): SuggestedNext | null {
  const youLc = you.toLowerCase();
  const candidates = tasks
    .filter((t) => !t.started_by || t.started_by.toLowerCase() === youLc)
    .filter(
      (t) => !t.assigned_to || t.assigned_to.toLowerCase() === youLc,
    )
    .sort((a, b) => {
      const aMine = a.assigned_to ? 0 : 1;
      const bMine = b.assigned_to ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.created_at.localeCompare(b.created_at);
    });

  for (const t of candidates) {
    const fp = Array.isArray(t.footprint) ? (t.footprint as string[]) : null;
    if (fp && fp.length > 0 && footprintsCollide(fp, othersBusyPaths)) continue;
    const laneBits: string[] = [];
    laneBits.push(t.assigned_to ? "assigned to you" : "unassigned");
    laneBits.push(`P${t.priority}`);
    laneBits.push(
      fp && fp.length > 0
        ? `lane clear (${fp.slice(0, 3).join(", ")})`
        : "footprint not predicted yet — check who_is_editing before starting",
    );
    return {
      id: t.id,
      title: t.title,
      priority: t.priority,
      footprint: fp,
      reason: laneBits.join(" · "),
    };
  }
  return null;
}
