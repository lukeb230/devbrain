import { describe, expect, it } from "vitest";
import { hasRole, withError } from "../org";

describe("hasRole", () => {
  it("orders owner > admin > member", () => {
    expect(hasRole("owner", "admin")).toBe(true);
    expect(hasRole("admin", "owner")).toBe(false);
    expect(hasRole("member", "member")).toBe(true);
    expect(hasRole("member", "admin")).toBe(false);
  });
});

describe("withError", () => {
  it("appends with ? or &", () => {
    expect(withError("/dashboard", "admin_only")).toBe("/dashboard?error=admin_only");
    expect(withError("/widget?tab=1", "owner_only")).toBe("/widget?tab=1&error=owner_only");
  });
});
