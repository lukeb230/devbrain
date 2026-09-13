// ============================================================================
// When an org owner approves a REQUESTED GitHub App install, GitHub fires
// installation.created with a `requester`, and nobody passes back through
// /api/github/setup — the only place an installation is normally claimed.
// This decides which org the installation belongs to, from rows: the
// requester's most recent OPEN request. No open request → stay unclaimed.
// ============================================================================

import { openRequest, type LinkRow, type RequestEvent } from "./onboarding-request";

export function pickClaimOrg(args: {
  requesterLogin: string;
  members: { org_id: string; github_login: string | null }[];
  eventsByOrg: Record<string, RequestEvent[]>;
  linksByOrg: Record<string, LinkRow[]>;
  now?: Date;
}): string | null {
  const login = args.requesterLogin.toLowerCase();
  const orgs = [...new Set(args.members.filter((m) => (m.github_login ?? "").toLowerCase() === login).map((m) => m.org_id))];
  let best: { orgId: string; at: number } | null = null;
  for (const orgId of orgs) {
    const events = (args.eventsByOrg[orgId] ?? []).filter((e) => {
      if (e.kind === "repo_link_cancelled") return true;
      return (e.payload.by ?? "").toLowerCase() === login;
    });
    const open = openRequest(events, args.linksByOrg[orgId] ?? [], args.now);
    if (!open) continue;
    const at = new Date(open.at).getTime();
    if (!best || at > best.at) best = { orgId, at };
  }
  return best?.orgId ?? null;
}
