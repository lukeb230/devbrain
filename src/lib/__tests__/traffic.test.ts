import { describe, expect, it } from "vitest";
import { computeLights } from "@/lib/traffic";
import type { MergePr } from "@/lib/merge-order";

const pr = (over: Partial<MergePr>): MergePr => ({
  number: 1, title: "t", author: "a", review_state: null, mergeable_state: "clean", draft: false, changed_files: [], ...over,
});

describe("computeLights", () => {
  it("draft → gray, conflicts → red, changes requested → red, unreviewed → yellow", () => {
    const l = computeLights([
      pr({ number: 1, draft: true }),
      pr({ number: 2, mergeable_state: "dirty", review_state: "approved" }),
      pr({ number: 3, review_state: "changes_requested" }),
      pr({ number: 4 }),
    ]);
    expect(l.get(1)?.state).toBe("gray");
    expect(l.get(2)?.state).toBe("red");
    expect(l.get(3)?.state).toBe("red");
    expect(l.get(4)?.state).toBe("yellow");
  });

  it("approved + clean + no overlap → green", () => {
    const l = computeLights([pr({ number: 5, review_state: "approved" })]);
    expect(l.get(5)).toEqual({ state: "green", reason: "cleared to land — press merge" });
  });

  it("two ready PRs sharing files: the one earlier in the plan is green, the other waits on it", () => {
    const l = computeLights([
      pr({ number: 10, review_state: "approved", changed_files: ["a.ts", "b.ts", "c.ts"] }),
      pr({ number: 11, review_state: "approved", changed_files: ["a.ts"] }),
    ]);
    const states = [l.get(10)?.state, l.get(11)?.state].sort();
    expect(states).toEqual(["green", "yellow"]);
    const waiting = l.get(10)?.state === "yellow" ? l.get(10) : l.get(11);
    expect(waiting?.reason).toMatch(/merge #\d+ first/);
  });

  it("an overlapping PR that is NOT ready never blocks a ready one", () => {
    const l = computeLights([
      pr({ number: 20, review_state: "approved", changed_files: ["a.ts"] }),
      pr({ number: 21, review_state: null, changed_files: ["a.ts", "b.ts"] }),
    ]);
    expect(l.get(20)?.state).toBe("green");
    expect(l.get(21)?.state).toBe("yellow");
  });
});
