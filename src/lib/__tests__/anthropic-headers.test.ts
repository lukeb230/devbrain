import { describe, expect, it } from "vitest";
import { anthropicHeaders } from "@/lib/agent";

describe("anthropicHeaders", () => {
  it("always carries the key and the API version", () => {
    const h = anthropicHeaders("sk-ant-test", "");
    expect(h["x-api-key"]).toBe("sk-ant-test");
    expect(h["anthropic-version"]).toBe("2023-06-01");
    expect(h["content-type"]).toBe("application/json");
  });

  it("adds the workspace only when one is configured", () => {
    // An org-level key is refused without this header.
    expect(anthropicHeaders("k", "wrkspc_123")["anthropic-workspace-id"]).toBe("wrkspc_123");
  });

  it("omits the header entirely when unset — an empty one is worse than absent", () => {
    for (const ws of ["", "   "]) {
      expect("anthropic-workspace-id" in anthropicHeaders("k", ws.trim())).toBe(false);
    }
  });
});
