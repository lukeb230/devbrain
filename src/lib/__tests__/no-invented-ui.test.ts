import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// ============================================================================
// The marketing pages depict the product. Every label they show must exist in
// the product.
//
// This test exists because a hand-built recreation drifts silently: an earlier
// version of the landing page invented an editor's permission prompt, a
// greeting, two list-pane section names, two cards and three PR statuses, and
// shipped all of it publicly. Reviewing a screenshot cannot catch that —
// grepping can.
//
// If this fails, the string is not in the app. Either the app gained it, or
// the page is making it up.
// ============================================================================

const APP = ["src/app/desk", "src/app/widget", "src/lib"];
const FILES = [
  "src/app/landing/app-shots.tsx",
  "src/app/landing/try-it.tsx",
  "src/app/landing/terminal.tsx",
];

/** Every label the shots put on screen, and where it must exist. */
const DEPICTED = [
  "Needs you",
  "Now working",
  "Claimed areas",
  "Open handoffs",
  "Standup",
  "Good afternoon",
  "has conflicts",
  "Handoff from",
  "Claim a lane",
  "Leave a handoff",
  "Broadcast",
  "Jump to anything",
  "cleared to land",
  "waiting on a teammate",
  "conflicts with main",
];

/** Strings that were invented once and must never come back. */
const BANNED = [
  "Proceed anyway",
  "No, coordinate first",
  "Claimed lanes",
  "Collision prevented",
  "Recent activity",
  "Three people are in this repo",
  "Kai is in a file you claimed",
  "merge first",
  "waits on #",
  "Updated src/",
];

const read = (p: string) => readFileSync(p, "utf8");
const appSource = () =>
  APP.flatMap((dir) => {
    const out: string[] = [];
    const walk = (d: string) => {
      for (const e of require("node:fs").readdirSync(d, { withFileTypes: true })) {
        const full = `${d}/${e.name}`;
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|tsx|mjs)$/.test(e.name)) out.push(readFileSync(full, "utf8"));
      }
    };
    walk(dir);
    return out;
  }).join("\n");

describe("the marketing pages do not invent product UI", () => {
  const app = appSource();
  const pages = FILES.map(read).join("\n");

  it.each(DEPICTED)("%s exists in the app", (label) => {
    expect(app).toContain(label);
  });

  it.each(BANNED)("%s never comes back", (label) => {
    // The terminal file documents the bans in a comment; strip comments first.
    const code = pages.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toContain(label);
  });

  it("the collision warning is verbatim from the guard", () => {
    const guard = read("plugin/hooks/check-collision.mjs");
    const sentence = "Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.";
    expect(guard).toContain(sentence);
    // The page wraps it across JSON lines, so compare on collapsed whitespace.
    const flat = pages.replace(/\s+/g, " ");
    expect(flat).toContain("Editing it anyway risks a collision — coordinate");
    expect(flat).toContain("first, or approve to proceed deliberately.");
  });
});
