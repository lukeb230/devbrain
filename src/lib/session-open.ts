import type { supabaseAdmin } from "@/lib/supabase/server";

// ============================================================================
// Opening a presence session. A teammate (a token label) runs one live session
// per agent per repo: the hooks keep one sidecar per repo on the machine, so a
// second start from the same host already makes the first untrackable there.
// Ending it here keeps the digest honest — Cursor opens a new conversation per
// chat and never formally ends the old one; Codex restarts around its hook
// trust prompt. Ownership is org + label, never user_id (see ingest/route.ts).
// ============================================================================

export type SessionStart = {
  org_id: string;
  repo_id: string;
  user_id: string;
  dev_label: string;
  agent_kind: string;
  branch: string | null;
  summary: string | null;
};

/** Escape ilike wildcards so a label is matched literally, case-insensitively. */
export function labelPattern(label: string): string {
  return label.replace(/[%_\\]/g, "\\$&");
}

/** Ends this teammate's other open sessions for the same agent and repo, then
 *  opens the new one. Returns the new session id, or null if nothing was stored. */
export async function openSession(admin: ReturnType<typeof supabaseAdmin>, s: SessionStart, now = new Date()): Promise<string | null> {
  const { error } = await admin
    .from("sessions")
    .update({ ended_at: now.toISOString() })
    .eq("org_id", s.org_id)
    .eq("repo_id", s.repo_id)
    .ilike("dev_label", labelPattern(s.dev_label))
    .eq("agent_kind", s.agent_kind)
    .is("ended_at", null);
  if (error) console.error("session-open: could not end superseded sessions", error.message);
  const { data } = await admin.from("sessions").insert(s).select("id").single();
  return data?.id ?? null;
}
