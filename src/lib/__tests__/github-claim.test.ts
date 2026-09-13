import { describe, expect, it } from "vitest";
import { pickClaimOrg } from "@/lib/github-claim";
import type { RequestEvent } from "@/lib/onboarding-request";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const req = (at: string, by: string = "luke"): RequestEvent => ({ kind: "repo_link_requested", at, payload: { by } });

describe("pickClaimOrg", () => {
  it("claims for the org with the requester's open request", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-a");
  });

  it("two teams for one login: the most recent open request wins", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }, { org_id: "org-b", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(3600_000))], "org-b": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-b");
  });

  it("a closed request does not re-claim", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(3600_000))] },
      linksByOrg: { "org-a": [{ created_at: ago(60_000), unlinked_at: null }] },
      now: NOW,
    });
    expect(org).toBeNull();
  });

  it("never claims for a team the requester is not a member of", () => {
    const org = pickClaimOrg({
      requesterLogin: "mallory",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBeNull();
  });

  it("login matching is case-insensitive, as GitHub logins are", () => {
    const org = pickClaimOrg({
      requesterLogin: "Luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000))] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-a");
  });

  it("does not claim an org whose newer open request was filed by someone else", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }, { org_id: "org-b", github_login: "luke" }],
      eventsByOrg: { "org-a": [req(ago(60_000), "mallory")], "org-b": [req(ago(3600_000), "luke")] },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBe("org-b");
  });

  it("a cancellation by another admin still closes the requester's request", () => {
    const org = pickClaimOrg({
      requesterLogin: "luke",
      members: [{ org_id: "org-a", github_login: "luke" }],
      eventsByOrg: {
        "org-a": [
          req(ago(3600_000), "luke"),
          { kind: "repo_link_cancelled" as const, at: ago(60_000), payload: { by: "admin2" } },
        ],
      },
      linksByOrg: {},
      now: NOW,
    });
    expect(org).toBeNull();
  });
});
