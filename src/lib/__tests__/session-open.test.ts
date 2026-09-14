import { describe, expect, it } from "vitest";
import { labelPattern, openSession } from "@/lib/session-open";
import type { supabaseAdmin } from "@/lib/supabase/server";

// A recording stand-in for the admin client: every builder call is appended to
// the current chain's record as [method, ...args]; awaiting a chain resolves it.
function fakeAdmin(calls: unknown[][][], insertId: string | null = "s-new") {
  return {
    from(table: string) {
      const rec: unknown[][] = [["from", table]];
      calls.push(rec);
      const api: Record<string, unknown> = {};
      for (const m of ["update", "insert", "select", "eq", "ilike", "is", "single"]) {
        api[m] = (...a: unknown[]) => { rec.push([m, ...a]); return api; };
      }
      api.then = (resolve: (v: unknown) => void) => resolve({ data: insertId ? { id: insertId } : null, error: null });
      return api;
    },
  } as unknown as ReturnType<typeof supabaseAdmin>;
}

const START = { org_id: "org-1", repo_id: "r-1", user_id: "u-1", dev_label: "cursor-mac", agent_kind: "cursor", branch: "main", summary: null };

describe("openSession", () => {
  it("ends the teammate's other open sessions for this agent and repo, then inserts", async () => {
    const calls: unknown[][][] = [];
    const id = await openSession(fakeAdmin(calls), START, new Date("2026-09-14T15:00:00Z"));
    expect(id).toBe("s-new");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toEqual([
      ["from", "sessions"],
      ["update", { ended_at: "2026-09-14T15:00:00.000Z" }],
      ["eq", "org_id", "org-1"],
      ["eq", "repo_id", "r-1"],
      ["ilike", "dev_label", "cursor-mac"],
      ["eq", "agent_kind", "cursor"],
      ["is", "ended_at", null],
    ]);
    expect(calls[1]).toEqual([["from", "sessions"], ["insert", START], ["select", "id"], ["single"]]);
  });

  it("returns null when the insert stores nothing", async () => {
    expect(await openSession(fakeAdmin([], null), START)).toBeNull();
  });
});

describe("labelPattern", () => {
  it("matches a label literally under ilike", () => {
    expect(labelPattern("Luke's MacBook")).toBe("Luke's MacBook");
    expect(labelPattern("a_b%c\\d")).toBe("a\\_b\\%c\\\\d");
  });
});
