import { describe, expect, it } from "vitest";
import { environmentFromEnv, releaseFromEnv, scrubEvent, SENTRY_DSN_VAR, surfaceOf } from "@/lib/sentry-scrub";

describe("surfaceOf", () => {
  it("maps the three surfaces", () => {
    expect(surfaceOf("/desk")).toBe("desk");
    expect(surfaceOf("/desk/help")).toBe("desk");
    expect(surfaceOf("/widget")).toBe("panel");
    expect(surfaceOf("/widget?x=1")).toBe("panel");
    expect(surfaceOf("/")).toBe("site");
    expect(surfaceOf("/support")).toBe("site");
    expect(surfaceOf("/api/v1/health")).toBe("site");
  });
});

describe("release and environment", () => {
  it("prefer the Vercel git sha, fall back to dev", () => {
    expect(releaseFromEnv({ VERCEL_GIT_COMMIT_SHA: "abc123" })).toBe("abc123");
    expect(releaseFromEnv({ NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA: "def456" })).toBe("def456");
    expect(releaseFromEnv({})).toBe("dev");
    expect(environmentFromEnv({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe("preview");
    expect(environmentFromEnv({ NODE_ENV: "development" })).toBe("development");
    expect(SENTRY_DSN_VAR).toBe("NEXT_PUBLIC_SENTRY_DSN");
  });
});

describe("scrubEvent", () => {
  it("keeps the user id and drops everything else about the person", () => {
    const e = scrubEvent({ user: { id: "u1", email: "l@x.com", username: "luke", ip_address: "1.2.3.4" }, tags: { team: "o1" } });
    expect(e.user).toEqual({ id: "u1" });
    expect(e.tags).toEqual({ team: "o1" });
  });
  it("strips auth and token headers and the query string", () => {
    const e = scrubEvent({ request: { url: "https://getdevbrain.com/api/v1/guard?code=secret&x=1", headers: { Authorization: "Bearer dbk_x", cookie: "sb=1", "x-devbrain-token": "t", "content-type": "application/json" } } });
    expect(e.request?.url).toBe("https://getdevbrain.com/api/v1/guard");
    expect(e.request?.headers).toEqual({ "content-type": "application/json" });
  });
  it("leaves an event with no user or request untouched", () => {
    const e = { message: "boom", extra: { a: 1 } };
    expect(scrubEvent(e)).toEqual(e);
  });
});
