import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { countAt, EASE_OUT } from "../landing-motion";

describe("countAt", () => {
  it("starts at 0 and ends exactly at the target", () => {
    expect(countAt(0, 17)).toBe(0);
    expect(countAt(1, 17)).toBe(17);
    expect(countAt(1.5, 17)).toBe(17);
  });
  it("is monotonic and rounds to whole numbers", () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const v = countAt(t, 96);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
  it("eases out: more than half done by 30% of the time", () => {
    expect(countAt(0.3, 100)).toBeGreaterThan(50);
  });
  it("exports the enter curve the app uses", () => {
    expect(EASE_OUT).toBe("cubic-bezier(.16,1,.3,1)");
  });
  it("the CSS actually uses that curve, not a copy that can drift", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    expect(css).toContain("cubic-bezier(.16,1,.3,1)");
  });
});

describe("cursor motion CSS", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  it("wander keyframes exist and are gated on the reveal", () => {
    expect(css).toContain("@keyframes lp-wander-a");
    expect(css).toContain("@keyframes lp-wander-b");
    expect(css).toMatch(/html\.lp-js \.lp-cursor-lena\[data-in\]\{animation:lp-wander-a/);
    expect(css).toMatch(/html\.lp-js \.lp-cursor-sam\[data-in\]\{animation:lp-wander-b/);
  });
  it("is off under reduced motion", () => {
    const reduced = css.split("@media (prefers-reduced-motion: reduce)").slice(1).join("\n");
    expect(reduced).toMatch(/\.lp-cursor-lena[^{]*\{animation:none/);
    expect(reduced).toMatch(/\.lp-cursor-sam[^{]*\{animation:none/);
  });
});
