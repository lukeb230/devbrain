// ============================================================================
// Rate limit — a per-key sliding window, in process memory.
//
// Fluid compute reuses an instance across requests, so this holds across the
// bursts it exists to stop (a hook stuck in a loop writing activity rows). It
// is deliberately NOT a global limit: a second instance has its own window,
// and that's fine — the goal is to bound a runaway client, not to meter
// customers. Fail-open by construction: nothing here can throw.
// ============================================================================

type Window = { start: number; count: number };

export function makeLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const windows = new Map<string, Window>();
  return {
    /** true = allowed. */
    take(key: string): boolean {
      const t = now();
      const w = windows.get(key);
      if (!w || t - w.start >= windowMs) {
        windows.set(key, { start: t, count: 1 });
        if (windows.size > 5000) for (const [k, v] of windows) if (t - v.start >= windowMs) windows.delete(k);
        return true;
      }
      w.count += 1;
      return w.count <= limit;
    },
  };
}

/** Presence ingest: a real session edits a few files a minute; 120/min is
 *  an order of magnitude above that and still stops a looping hook. */
export const ingestLimiter = makeLimiter(120, 60_000);

/** Public unauthenticated endpoints (invite links, device exchange): generous
 *  per-IP ceiling that still blunts code/token guessing. */
export const joinLimiter = makeLimiter(30, 60_000);
export const deviceLimiter = makeLimiter(30, 60_000);
