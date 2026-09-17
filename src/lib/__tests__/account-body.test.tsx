// src/lib/__tests__/account-body.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountBody, type AccountProps } from "@/app/account/account-body";

const props: AccountProps = {
  login: "lukeb230", email: "luke@example.com",
  teams: [
    { orgId: "o1", name: "Alpha", role: "owner", ownerCount: 1, memberCount: 1, billingStatus: "trialing", hasSubscription: false, plan: { name: "Free beta", status: "trialing", betaFree: true }, active: true },
    { orgId: "o2", name: "Beta", role: "owner", ownerCount: 1, memberCount: 4, billingStatus: "active", hasSubscription: true, plan: { name: "Scale", status: "active", betaFree: false }, active: false },
    { orgId: "o3", name: "Gamma", role: "member", ownerCount: 2, memberCount: 9, billingStatus: "active", hasSubscription: true, plan: null, active: false },
  ],
  devices: [{ id: "t1", label: "Luke's MacBook Pro", team: "Alpha", lastUsedAt: "2026-09-16T04:51:50Z" }],
};

describe("AccountBody", () => {
  const html = renderToStaticMarkup(<AccountBody {...props} />);
  it("shows who you are and a sign-out form that lands on the site", () => {
    expect(html).toContain("lukeb230");
    expect(html).toContain("luke@example.com");
    expect(html).toMatch(/<form[^>]*action="\/auth\/sign-out"[^>]*method="post"/);
    expect(html).not.toContain('name="from"');
  });
  it("lists every team with its role and the right controls", () => {
    // Alpha: sole member → Delete team (with the name confirm), no Leave.
    expect(html).toMatch(/Alpha[\s\S]*Delete team/);
    expect(html).toContain('placeholder="Alpha"');
    // Beta: sole owner with others → Leave disabled with the explanation; Delete team offered (owner).
    expect(html).toContain("only owner of Beta");
    // Gamma: plain member → Leave enabled, no Delete team, no plan line.
    expect(html).toMatch(/Gamma[\s\S]*Leave team/);
    expect((html.match(/Delete team/g) ?? []).length).toBe(2);
  });
  it("shows the plan for admins and links the plan page", () => {
    expect(html).toContain("Free beta");
    expect(html).toContain("Scale");
    expect(html).toMatch(/href="\/desk\/plan"/);
  });
  it("lists devices with a revoke form", () => {
    expect(html).toContain("Luke&#x27;s MacBook Pro");
    expect(html).toMatch(/name="id" value="t1"/);
    expect(html).toContain("Revoke");
  });
  it("offers the data-request pointer and the delete-account form", () => {
    expect(html).toMatch(/href="\/support"/);
    expect(html).toContain("delete my account");
    expect(html).toMatch(/name="confirm"/);
  });
  it("renders with no teams and no devices", () => {
    const empty = renderToStaticMarkup(<AccountBody {...props} teams={[]} devices={[]} />);
    // React 19's renderToStaticMarkup escapes ASCII apostrophes in text
    // nodes to &#x27; unconditionally (react-dom-server-legacy.node.development.js,
    // escapeTextForBrowser, char code 39) — the same reason the device-label
    // assertion above checks for "Luke&#x27;s MacBook Pro" rather than the
    // raw apostrophe. The copy itself (account-body.tsx: "You're not in a
    // team yet.") is unchanged; only this assertion's expected string
    // matches how React actually serializes it.
    expect(empty).toContain("You&#x27;re not in a team yet");
    expect(empty).toContain("No devices");
  });
});
