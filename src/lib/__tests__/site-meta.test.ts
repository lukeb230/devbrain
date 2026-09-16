// src/lib/__tests__/site-meta.test.ts
import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap, { SITE_PAGES, SITE_URL } from "@/app/sitemap";
import { metadata } from "@/app/layout";
import { wwwRedirect } from "@/lib/site-redirects";

describe("site metadata", () => {
  it("lists exactly the public pages in the sitemap, on the canonical host", () => {
    expect(SITE_PAGES).toEqual(["/", "/faq", "/support", "/start", "/terms", "/privacy"]);
    const urls = sitemap().map((e) => e.url);
    expect(urls).toEqual(SITE_PAGES.map((p) => `${SITE_URL}${p}`));
    for (const u of urls) expect(u.startsWith("https://")).toBe(true);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });
  it("robots allows the site and blocks the app and API, and names the sitemap", () => {
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules : [r.rules];
    const allow = rules.flatMap((x) => [x.allow ?? []].flat());
    const disallow = rules.flatMap((x) => [x.disallow ?? []].flat());
    expect(allow).toContain("/");
    for (const p of ["/api/", "/desk/", "/auth/", "/widget/", "/open", "/download", "/join/", "/welcome", "/settings/", "/dashboard/", "/billing/"]) expect(disallow).toContain(p);
    expect(r.sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });
  it("every page gets a canonical of its own path", () => {
    expect(metadata.alternates?.canonical).toBe("./");
    expect(String(metadata.metadataBase)).toBe(`${SITE_URL}/`);
  });
  it("www redirects to the apex host and keeps the path and query", () => {
    const site = "https://getdevbrain.com";
    const u = (s: string) => new URL(s);
    expect(wwwRedirect("www.getdevbrain.com", u("https://www.getdevbrain.com/faq?x=1"), site)).toBe("https://getdevbrain.com/faq?x=1");
    expect(wwwRedirect("www.getdevbrain.com:443", u("https://www.getdevbrain.com/"), site)).toBe("https://getdevbrain.com/");
    expect(wwwRedirect("getdevbrain.com", u("https://getdevbrain.com/faq"), site)).toBeNull();
    expect(wwwRedirect("devbrain-seven.vercel.app", u("https://devbrain-seven.vercel.app/"), site)).toBeNull();
    expect(wwwRedirect("www.example.com", u("https://www.example.com/"), site)).toBeNull();
    expect(wwwRedirect(null, u("https://www.getdevbrain.com/"), site)).toBeNull();
    expect(wwwRedirect("www.getdevbrain.com", u("http://localhost:3123/faq?x=1"), site)).toBe("https://getdevbrain.com/faq?x=1");
    expect(wwwRedirect("www.example.com:8443", u("https://www.example.com:8443/a"), "https://example.com:8443")).toBe("https://example.com:8443/a");
  });
});
