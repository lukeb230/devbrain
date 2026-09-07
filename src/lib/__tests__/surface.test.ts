import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { returnTo, surfaceOf, surfaceRoot, withErrorOn } from "@/lib/surface";

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("returnTo", () => {
  it("honours a Desk, panel or dashboard next", () => {
    expect(returnTo(fd({ next: "/desk/board?repo=abc" }), "/dashboard/x/tasks")).toBe("/desk/board?repo=abc");
    expect(returnTo(fd({ next: "/widget" }), "/dashboard")).toBe("/widget");
    expect(returnTo(fd({ next: "/dashboard/x/specs" }), "/desk")).toBe("/dashboard/x/specs");
    expect(returnTo(fd({ next: "/desk" }), "/dashboard")).toBe("/desk");
  });
  it("falls back for anything that is not one of the three surfaces", () => {
    expect(returnTo(fd({ next: "https://evil.example/" }), "/dashboard")).toBe("/dashboard");
    expect(returnTo(fd({ next: "//evil.example/desk" }), "/dashboard")).toBe("/dashboard");
    expect(returnTo(fd({ next: "/settings/org" }), "/dashboard")).toBe("/dashboard");
    expect(returnTo(fd({ next: "/deskish" }), "/dashboard")).toBe("/dashboard");
    expect(returnTo(fd({}), "/dashboard/x/tasks")).toBe("/dashboard/x/tasks");
    expect(returnTo(null, "/dashboard")).toBe("/dashboard");
  });
  it("keeps the panel's legacy stay flag working", () => {
    expect(returnTo(fd({ stay: "1" }), "/dashboard")).toBe("/widget");
    expect(returnTo(fd({ stay: "1", next: "/desk/rules" }), "/dashboard")).toBe("/desk/rules"); // next wins
  });
});

describe("surfaceOf / surfaceRoot / withErrorOn", () => {
  it("classifies paths and finds each surface's home", () => {
    expect(surfaceOf("/desk/board")).toBe("desk");
    expect(surfaceOf("/widget?x=1")).toBe("widget");
    expect(surfaceOf("/dashboard/abc")).toBe("dashboard");
    expect(surfaceRoot("/desk/specs/1")).toBe("/desk");
    expect(surfaceRoot("/widget")).toBe("/widget");
    expect(surfaceRoot("/dashboard/abc/tasks")).toBe("/dashboard");
  });
  it("appends the error code with the right separator", () => {
    expect(withErrorOn("/desk/board", "no_access")).toBe("/desk/board?error=no_access");
    expect(withErrorOn("/desk/board?repo=1", "no_access")).toBe("/desk/board?repo=1&error=no_access");
  });
});
