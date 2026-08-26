import { describe, expect, it } from "vitest";
import { PRIORITY_MAP, parseTitle } from "@/lib/reminders";

describe("parseTitle", () => {
  it("pulls @assignee and #tags out of the title and strips them", () => {
    expect(parseTitle("Fix export @Ethan #export #billing")).toEqual({
      title: "Fix export", assignee: "ethan", tags: ["export", "billing"],
    });
  });
  it("does not treat a PR number as a tag", () => {
    expect(parseTitle("Follow up on #212 #ops")).toEqual({ title: "Follow up on #212", assignee: null, tags: ["ops"] });
  });
  it("dedupes tags, caps at 8, collapses whitespace, caps title at 200", () => {
    const tags = Array.from({ length: 12 }, (_, i) => `#t${i}`).join(" ");
    const r = parseTitle(`${"long ".repeat(45)} #a #a ${tags}`);
    expect(r.tags[0]).toBe("a");
    expect(r.tags).toHaveLength(8);
    expect(r.title.length).toBeLessThanOrEqual(200);
    expect(r.title).not.toMatch(/\s{2,}/);
  });
  it("handles empty and non-string input", () => {
    expect(parseTitle("")).toEqual({ title: "", assignee: null, tags: [] });
    expect(parseTitle(undefined as unknown as string).title).toBe("");
  });
});

describe("PRIORITY_MAP", () => {
  it("maps Apple's CalDAV scale to P1..P3", () => {
    expect([1, 5, 9, 0].map((p) => PRIORITY_MAP[p])).toEqual([1, 2, 3, 3]);
  });
});
