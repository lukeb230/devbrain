import { beforeEach, describe, expect, it, vi } from "vitest";

// onRequestError must hand the error to BOTH Sentry and the native ops
// alert, and neither may stop the other. Everything is mocked; no network.
const captureRequestError = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@sentry/nextjs", () => ({ captureRequestError: (...a: unknown[]) => captureRequestError(...a) }));
const alert = vi.fn(async (_i: unknown) => {});
vi.mock("@/lib/alerts", () => ({ alert: (i: unknown) => alert(i) }));

const { onRequestError } = await import("@/instrumentation");
const req = { path: "/api/v1/guard", method: "POST", headers: {} };
const ctx = { routerKind: "App Router", routePath: "/api/v1/guard", routeType: "route" };

describe("onRequestError", () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.NEXT_RUNTIME = "nodejs"; });

  it("reports to Sentry and raises the ops alert", async () => {
    await onRequestError(new Error("boom"), req, ctx);
    expect(captureRequestError).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ scope: "ops", key: "http./api/v1/guard", title: "Unhandled error in POST /api/v1/guard" }));
  });

  it("a throwing Sentry call does not stop the alert, and vice versa", async () => {
    captureRequestError.mockRejectedValueOnce(new Error("sdk down"));
    await expect(onRequestError(new Error("boom"), req, ctx)).resolves.toBeUndefined();
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRejectedValueOnce(new Error("db down"));
    await expect(onRequestError(new Error("boom"), req, ctx)).resolves.toBeUndefined();
    expect(captureRequestError).toHaveBeenCalledTimes(2);
  });

  it("does nothing on the edge runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    await onRequestError(new Error("boom"), req, ctx);
    expect(captureRequestError).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });
});
