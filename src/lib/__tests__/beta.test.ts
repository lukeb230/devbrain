import { describe, expect, it } from "vitest";
import { BETA_OFF, coversTeam, hasRoom, type BetaState } from "@/lib/beta";

const beta = (over: Partial<BetaState> = {}): BetaState => ({ free: true, maxTeams: 10, maxMembers: 40, endsAt: null, ...over });

describe("hasRoom", () => {
  it("lets people in below both ceilings", () => {
    expect(hasRoom(beta(), { teams: 9, members: 39 }, "team")).toBe(true);
    expect(hasRoom(beta(), { teams: 9, members: 39 }, "member")).toBe(true);
  });

  it("closes team creation at the team ceiling, but not the door for teammates", () => {
    expect(hasRoom(beta(), { teams: 10, members: 12 }, "team")).toBe(false);
    expect(hasRoom(beta(), { teams: 10, members: 12 }, "member")).toBe(true);
  });

  it("the people ceiling closes both", () => {
    expect(hasRoom(beta(), { teams: 2, members: 40 }, "team")).toBe(false);
    expect(hasRoom(beta(), { teams: 2, members: 40 }, "member")).toBe(false);
  });

  it("a null ceiling is no ceiling", () => {
    expect(hasRoom(beta({ maxTeams: null, maxMembers: null }), { teams: 9e9, members: 9e9 }, "team")).toBe(true);
    expect(hasRoom(BETA_OFF, { teams: 9e9, members: 9e9 }, "team")).toBe(true);
  });

  it("free and full are independent: the beta can be free and closed, or open and paid", () => {
    expect(hasRoom(beta({ free: false }), { teams: 10, members: 1 }, "team")).toBe(false);
    expect(hasRoom(beta({ free: true, maxTeams: null }), { teams: 10, members: 1 }, "team")).toBe(true);
  });
});

describe("coversTeam", () => {
  it("covers a team that never subscribed, whatever the row says", () => {
    expect(coversTeam(beta(), { status: "comped", hasSubscription: false })).toBe(true);
    // created before the switch was thrown — still "trialing" in the database
    expect(coversTeam(beta(), { status: "trialing", hasSubscription: false })).toBe(true);
    // a lapsed team is free again during the beta rather than staying walled
    expect(coversTeam(beta(), { status: "canceled", hasSubscription: false })).toBe(true);
  });

  it("leaves a paying team to Stripe", () => {
    expect(coversTeam(beta(), { status: "active", hasSubscription: true })).toBe(false);
    expect(coversTeam(beta(), { status: "trialing", hasSubscription: true })).toBe(false);
    expect(coversTeam(beta(), { status: "active", hasSubscription: false })).toBe(false);
  });

  it("covers nobody once the beta is not free — which is what makes the exit work", () => {
    for (const status of ["comped", "trialing", "canceled", "active"]) {
      expect(coversTeam(beta({ free: false }), { status, hasSubscription: false })).toBe(false);
    }
  });
});
