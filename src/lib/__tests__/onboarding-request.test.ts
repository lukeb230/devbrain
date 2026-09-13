import { describe, expect, it } from "vitest";
import { openRequest, REQUEST_TTL_MS, type LinkRow, type RequestEvent } from "@/lib/onboarding-request";

const NOW = new Date("2026-09-12T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const req = (at: string, by = "luke"): RequestEvent => ({ kind: "repo_link_requested", at, payload: { by } });
const cancel = (at: string): RequestEvent => ({ kind: "repo_link_cancelled", at, payload: {} });
const link = (created_at: string, unlinked_at: string | null = null): LinkRow => ({ created_at, unlinked_at });

describe("openRequest", () => {
  it("is null with no request at all", () => {
    expect(openRequest([], [], NOW)).toBeNull();
  });

  it("returns a fresh request", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r], [], NOW)).toEqual(r);
  });

  it("picks the most recent request when there are several", () => {
    const old = req(ago(2 * 86_400_000), "a");
    const recent = req(ago(3600_000), "b");
    expect(openRequest([old, recent], [], NOW)).toEqual(recent);
    expect(openRequest([recent, old], [], NOW)).toEqual(recent);
  });

  it("expires after REQUEST_TTL_MS — GitHub never tells us about a denial", () => {
    expect(openRequest([req(ago(REQUEST_TTL_MS + 1))], [], NOW)).toBeNull();
    expect(openRequest([req(ago(REQUEST_TTL_MS - 1))], [], NOW)).not.toBeNull();
  });

  it("a newer cancellation closes it; an older one does not", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r, cancel(ago(60_000))], [], NOW)).toBeNull();
    expect(openRequest([r, cancel(ago(7200_000))], [], NOW)).toEqual(r);
  });

  it("a newer live link closes it; an older or unlinked one does not", () => {
    const r = req(ago(3600_000));
    expect(openRequest([r], [link(ago(60_000))], NOW)).toBeNull();
    expect(openRequest([r], [link(ago(7200_000))], NOW)).toEqual(r);
    expect(openRequest([r], [link(ago(60_000), ago(30_000))], NOW)).toEqual(r);
  });
});
