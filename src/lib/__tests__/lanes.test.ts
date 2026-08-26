import { describe, expect, it } from "vitest";
import { footprintsCollide, pathsOverlap, pickSuggestedNext, type LaneTask } from "@/lib/lanes";

const t = (over: Partial<LaneTask>): LaneTask => ({
  id: "x", title: "x", priority: 3, tags: [], assigned_to: null, started_by: null, footprint: null, created_at: "2026-01-01", ...over,
});

describe("pathsOverlap / footprintsCollide", () => {
  it("is prefix-based in both directions and ignores ./", () => {
    expect(pathsOverlap("src/auth/", "src/auth/login.ts")).toBe(true);
    expect(pathsOverlap("./src/auth/login.ts", "src/auth/")).toBe(true);
    expect(pathsOverlap("src/auth/", "src/authz/")).toBe(false);
    expect(pathsOverlap("", "src")).toBe(false);
  });
  it("collides when any pair overlaps", () => {
    expect(footprintsCollide(["src/a/", "src/b/"], ["src/c/", "src/b/x.ts"])).toBe(true);
    expect(footprintsCollide(["src/a/"], ["src/c/"])).toBe(false);
  });
});

describe("pickSuggestedNext", () => {
  it("prefers tasks assigned to you, then priority, then age", () => {
    const pick = pickSuggestedNext([
      t({ id: "old-p2", priority: 2, created_at: "2026-01-01" }),
      t({ id: "mine-p4", priority: 4, assigned_to: "Luke" }),
      t({ id: "new-p1", priority: 1, created_at: "2026-02-01" }),
    ], "luke", []);
    expect(pick?.id).toBe("mine-p4");
    expect(pick?.reason).toContain("assigned to you");
  });

  it("never suggests a task someone else started or that is assigned to someone else", () => {
    const pick = pickSuggestedNext([
      t({ id: "theirs", priority: 1, started_by: "ethan" }),
      t({ id: "assigned-away", priority: 1, assigned_to: "ethan" }),
      t({ id: "free", priority: 2 }),
    ], "luke", []);
    expect(pick?.id).toBe("free");
  });

  it("skips a lane collision and explains a missing footprint", () => {
    const pick = pickSuggestedNext([
      t({ id: "busy", priority: 1, footprint: ["src/auth/"] }),
      t({ id: "unknown", priority: 2, footprint: null }),
    ], "luke", ["src/auth/login.ts"]);
    expect(pick?.id).toBe("unknown");
    expect(pick?.reason).toContain("footprint not predicted yet");
  });

  it("returns null when nothing is lane-safe", () => {
    expect(pickSuggestedNext([t({ id: "busy", footprint: ["src/"] })], "luke", ["src/x.ts"])).toBeNull();
  });
});
