import { describe, expect, it } from "vitest";
import { BETA_OFF, hasRoom, type BetaState } from "@/lib/beta";

const beta = (over: Partial<BetaState> = {}): BetaState => ({ free: true, maxTeams: 10, maxMembers: 40, ...over });

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
