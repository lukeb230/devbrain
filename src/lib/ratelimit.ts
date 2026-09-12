// ============================================================================
// Rate limits, in two layers.
//
//   makeLimiter  — a per-key sliding window in process memory. Free, instant,
//                  and bounded to one serverless instance. It stops a runaway
//                  client (a hook stuck in a loop) and nothing else.
//
//   durable      — fixed windows in Postgres (rate_take_many), shared by every
//                  instance, so a flood spread across connections still trips.
//                  Counting is batched and the round trip is never awaited:
//                  a request costs memory bookkeeping only, and the global
//                  count lags by at most one flush (1.5 s). A bucket that
//                  trips is remembered locally, so a sustained flood is
//                  refused from memory without touching the database.
//
// Both fail OPEN by construction: a limiter that throws would take the API
// down with it, which is worse than the abuse it exists to stop. The one
// exception is the local ceiling in the durable layer — if this instance
// alone has already served a bucket's whole limit, it refuses without needing
// the database to agree.
//
// The ceilings live in system_state.rate_limits and are re-read every minute,
// so raising one during an incident is a single row, not a deploy.
// ============================================================================

import { after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";

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

// ---------------------------------------------------------------------------
// The durable layer
// ---------------------------------------------------------------------------

export interface Check {
  /** Stable name for what is being counted, e.g. `tok:<uuid>`. */
  bucket: string;
  limit: number;
  /** Window length in seconds. */
  window: number;
}

const FLUSH_MS = 1500;

type Slot = { windowStart: number; pending: number; seen: number; lastSent: number; denied: boolean };

const slots = new Map<string, Slot>();

const windowStartOf = (now: number, windowSec: number) => Math.floor(now / (windowSec * 1000)) * windowSec * 1000;

function flush(items: { check: Check; cost: number }[]) {
  const checks = items.map((i) => ({ bucket: i.check.bucket, limit: i.check.limit, window: i.check.window, cost: i.cost }));
  const work = supabaseAdmin()
    .rpc("rate_take_many", { p_checks: checks })
    .then(
      ({ data }) => {
        for (const bucket of (data as string[] | null) ?? []) {
          const s = slots.get(bucket);
          if (s) s.denied = true;
        }
      },
      () => {}, // the database is the backstop, not the gate — fail open
    );
  // Keep the instance alive until the count lands; outside a request scope
  // (tests, scripts) after() throws and the promise simply races the process.
  try {
    after(Promise.resolve(work));
  } catch {}
}

/** Count one request against every check. Returns the bucket that is over its
 *  limit, or null when the request is allowed. Never throws, never awaits. */
export function durableTake(checks: Check[]): string | null {
  const now = Date.now();
  const pending: { check: Check; cost: number }[] = [];
  let over: string | null = null;
  for (const c of checks) {
    const ws = windowStartOf(now, c.window);
    let s = slots.get(c.bucket);
    if (!s || s.windowStart !== ws) {
      s = { windowStart: ws, pending: 0, seen: 0, lastSent: 0, denied: false };
      slots.set(c.bucket, s);
    }
    s.seen += 1;
    // Already known to be over — globally, or on this instance alone.
    if (s.denied || s.seen > c.limit) {
      s.denied = true;
      over ??= c.bucket;
      continue;
    }
    s.pending += 1;
    if (s.lastSent === 0 || now - s.lastSent >= FLUSH_MS) {
      pending.push({ check: c, cost: s.pending });
      s.pending = 0;
      s.lastSent = now;
    }
  }
  if (pending.length) flush(pending);
  if (slots.size > 20_000) for (const [k, v] of slots) if (now - v.windowStart > 86_400_000) slots.delete(k);
  return over;
}

// ---------------------------------------------------------------------------
// The ceilings
// ---------------------------------------------------------------------------

export interface Limits {
  token_per_min: number;
  org_per_min: number;
  org_per_day: number;
  ip_per_min: number;
  global_per_min: number;
}

export const DEFAULT_LIMITS: Limits = {
  token_per_min: 240,
  org_per_min: 1200,
  org_per_day: 200_000,
  ip_per_min: 60,
  global_per_min: 30_000,
};

let cached: { at: number; value: Limits } = { at: 0, value: DEFAULT_LIMITS };

/** The tunable ceilings, re-read from system_state at most once a minute.
 *  Returns the last known values while a refresh is in flight. */
export function limits(): Limits {
  const now = Date.now();
  if (now - cached.at > 60_000) {
    cached = { at: now, value: cached.value };
    supabaseAdmin()
      .from("system_state")
      .select("value")
      .eq("key", "rate_limits")
      .maybeSingle()
      .then(
        ({ data }) => {
          const v = (data?.value ?? {}) as Partial<Limits>;
          cached = { at: Date.now(), value: { ...DEFAULT_LIMITS, ...v } };
        },
        () => {},
      );
  }
  return cached.value;
}

/** Is this bucket already known to be over, without counting a hit? Used to
 *  refuse a caller before doing the work that identifies them. */
export function durableDenied(bucket: string, windowSec: number): boolean {
  const s = slots.get(bucket);
  return !!s && s.denied && s.windowStart === windowStartOf(Date.now(), windowSec);
}

/** Test seam: forget the cached ceilings and every counted window. */
export function _resetLimiterState() {
  slots.clear();
  cached = { at: 0, value: DEFAULT_LIMITS };
}
