import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// ============================================================================
// Structural test: every v1 route authenticates AND counts through apiAuth.
// A new route that calls resolveDevToken directly authenticates fine and is
// invisible to the rate limiter — exactly the kind of hole nobody notices
// until a bill arrives. The check is on the source, so it costs nothing.
// ============================================================================

const V1 = "src/app/api/v1";

function routes(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) return routes(p);
    return e === "route.ts" ? [p] : [];
  });
}

describe("v1 API routes", () => {
  const files = routes(V1);

  it("has routes to check", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it("every one authenticates through apiAuth, so every one is rate limited", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return src.includes("resolveDevToken(") && !src.includes("apiAuth(");
    });
    expect(offenders).toEqual([]);
  });

  it("none of them hand-rolls the 401 that apiAuth already returns", () => {
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return /if \(!auth\) return NextResponse\.json\(\{ error: "unauthorized"/.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
