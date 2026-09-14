import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/desk/(team)/tokens/page.tsx", "utf8");

describe("the tokens page's manual-setup hint", () => {
  it("names the bootstrap command with the server, and never the nonexistent connect command", () => {
    expect(page).toContain("devbrain bootstrap --server");
    expect(page).not.toContain("devbrain connect");
  });
});
