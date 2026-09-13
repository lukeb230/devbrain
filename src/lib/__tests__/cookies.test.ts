import { describe, expect, it } from "vitest";
import { ALL_DEVBRAIN_COOKIES, COOKIE, clearDevbrainCookies, readCookieHeader } from "../cookies";

describe("clearDevbrainCookies", () => {
  it("expires every cookie on the path it was set", () => {
    const calls: [string, string, Record<string, unknown>][] = [];
    clearDevbrainCookies({ set: (n, v, o) => calls.push([n, v, o]) });
    expect(calls.map((c) => c[0]).sort()).toEqual(ALL_DEVBRAIN_COOKIES.map((c) => c.name).sort());
    for (const [, v, o] of calls) { expect(v).toBe(""); expect(o.maxAge).toBe(0); }
    expect(calls.find((c) => c[0] === COOKIE.newToken)![2].path).toBe("/settings");
  });

  it("keeps the app-channel cookie: signing out does not change which app is installed", () => {
    expect(COOKIE.channel).toBe("devbrain_channel");
    expect(ALL_DEVBRAIN_COOKIES.some((c) => c.name === COOKIE.channel)).toBe(false);
  });
});

describe("readCookieHeader", () => {
  it("reads, decodes and tolerates junk", () => {
    expect(readCookieHeader("a=1; devbrain_next=%2Fwidget; b=2", "devbrain_next")).toBe("/widget");
    expect(readCookieHeader("devbrain_next=%E0%A4%A", "devbrain_next")).toBe("");
    expect(readCookieHeader(null, "devbrain_next")).toBe("");
    expect(readCookieHeader("xdevbrain_next=1", "devbrain_next")).toBe("");
  });
});
