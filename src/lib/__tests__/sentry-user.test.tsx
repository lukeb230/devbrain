import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@sentry/nextjs", () => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/widget" }));
const { SentryUser } = await import("@/components/SentryUser");

describe("SentryUser (client)", () => {
  it("renders nothing", () => {
    expect(renderToStaticMarkup(<SentryUser userId="u1" orgId="o1" />)).toBe("");
    expect(renderToStaticMarkup(<SentryUser userId={null} orgId={null} />)).toBe("");
  });
});
