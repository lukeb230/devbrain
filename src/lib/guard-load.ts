import { guardOutcomes, GUARD_EDIT_WINDOW_MS, type GuardActivity, type GuardWarn } from "@/lib/guard";
import type { supabaseAdmin } from "@/lib/supabase/server";

type Admin = ReturnType<typeof supabaseAdmin>;

export type GuardStats = { warned: number; edited_after: number; window_min: number };

// The two honest guard numbers for a repo since a moment: how many times the
// guard warned, and how many of those were followed by an edit to that file by
// that session inside the window. Derived from rows every time; no counters.
// Cheap in the common case — no warns means one small query and no second.
export async function loadGuardStats(admin: Admin, repoId: string, sinceIso: string): Promise<GuardStats> {
  const { data: rows } = await admin
    .from("events")
    .select("id, at, payload")
    .eq("repo_id", repoId)
    .eq("kind", "collision_warned")
    .gte("at", sinceIso)
    .order("at", { ascending: false })
    .limit(500);
  const warns: GuardWarn[] = (rows ?? []).map((r) => {
    const p = (r.payload ?? {}) as { rel?: string; actor_session?: string | null };
    return { id: Number(r.id), at: String(r.at), actor_session: p.actor_session ?? null, rel: String(p.rel ?? "") };
  });
  if (warns.length === 0) return { warned: 0, edited_after: 0, window_min: GUARD_EDIT_WINDOW_MS / 60_000 };

  // Only the activity that could possibly match: the warned sessions, the
  // warned files, from the first warn onward (plus the window).
  const sessionIds = [...new Set(warns.map((w) => w.actor_session).filter((s): s is string => Boolean(s)))];
  const files = [...new Set(warns.map((w) => w.rel))];
  let activity: GuardActivity[] = [];
  if (sessionIds.length && files.length) {
    const { data } = await admin
      .from("activity")
      .select("session_id, file, at")
      .eq("repo_id", repoId)
      .in("session_id", sessionIds)
      .in("file", files)
      .gte("at", sinceIso)
      .limit(2000);
    activity = ((data ?? []) as { session_id: string | null; file: string; at: string }[]);
  }
  return { ...guardOutcomes(warns, activity), window_min: GUARD_EDIT_WINDOW_MS / 60_000 };
}
