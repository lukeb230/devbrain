// ============================================================================
// "Link a repo" has three states, and the middle one — a GitHub App install
// REQUESTED by someone who is not an org owner — is derived, never stored.
// GitHub sends no webhook when an owner denies a request, so a request must
// expire on its own, and the user must be able to start over.
// ============================================================================

export const REQUEST_TTL_MS = 14 * 86_400_000;

export type RequestEvent = {
  kind: "repo_link_requested" | "repo_link_cancelled";
  at: string;
  payload: { by?: string };
};

export type LinkRow = { created_at: string; unlinked_at: string | null };

const ms = (iso: string) => new Date(iso).getTime();

/** The org's open request, or null. Pure — callers pass the rows. */
export function openRequest(events: RequestEvent[], links: LinkRow[], now = new Date()): RequestEvent | null {
  const requests = events.filter((e) => e.kind === "repo_link_requested").sort((a, b) => ms(b.at) - ms(a.at));
  const latest = requests[0];
  if (!latest) return null;
  const at = ms(latest.at);
  if (now.getTime() - at > REQUEST_TTL_MS) return null;
  if (events.some((e) => e.kind === "repo_link_cancelled" && ms(e.at) > at)) return null;
  if (links.some((l) => l.unlinked_at === null && ms(l.created_at) > at)) return null;
  return latest;
}
