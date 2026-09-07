import { describe, expect, it } from "vitest";
import { deskRouteFor, retiredRedirect, safeDeskRoute } from "@/lib/retire";

const R = "a04067f8-d5bf-444d-9d15-34745e434b2b";
const S = "12c2903b-8c1d-450b-8ea3-95ba85b6c66e";

describe("deskRouteFor", () => {
  it("maps the team home and every repo page", () => {
    expect(deskRouteFor("/dashboard")).toBe("/desk");
    expect(deskRouteFor(`/dashboard/${R}`)).toBe(`/desk?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/tasks`)).toBe(`/desk/board?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/specs`)).toBe(`/desk/specs?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/specs/${S}`)).toBe(`/desk/specs/${S}?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/brain`)).toBe(`/desk/brain?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/history/`)).toBe(`/desk/history?repo=${R}`);
    expect(deskRouteFor(`/dashboard/${R}/rules`)).toBe(`/desk/rules?repo=${R}`);
  });
  it("maps the retired settings pages and leaves setup alone", () => {
    expect(deskRouteFor("/settings/members")).toBe("/desk/members");
    expect(deskRouteFor("/settings/org")).toBe("/desk/team");
    expect(deskRouteFor("/settings/tokens")).toBe("/desk/tokens");
    expect(deskRouteFor("/settings/reminders/")).toBe("/desk/reminders");
    expect(deskRouteFor("/settings/setup")).toBeNull();
  });
  it("ignores everything else", () => {
    for (const p of ["/", "/desk", "/widget", "/welcome", "/join/abc", "/api/v1/health", "/dashboard/not-a-uuid", "/dashboardx"]) expect(deskRouteFor(p)).toBeNull();
  });
});

describe("retiredRedirect / safeDeskRoute", () => {
  it("wraps the route for /open", () => {
    expect(retiredRedirect(`/dashboard/${R}/tasks`)).toBe(`/open?to=${encodeURIComponent(`/desk/board?repo=${R}`)}`);
    expect(retiredRedirect("/desk")).toBeNull();
  });
  it("only ever opens Desk routes", () => {
    expect(safeDeskRoute("/desk/board?repo=1")).toBe("/desk/board?repo=1");
    expect(safeDeskRoute("/desk")).toBe("/desk");
    expect(safeDeskRoute("https://evil.example/")).toBe("/desk");
    expect(safeDeskRoute("//evil/desk")).toBe("/desk");
    expect(safeDeskRoute("/dashboard")).toBe("/desk");
    expect(safeDeskRoute(null)).toBe("/desk");
  });
});
