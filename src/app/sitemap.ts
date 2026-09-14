import type { MetadataRoute } from "next";

// The public site. Everything else (the Console, the widget, auth, the API)
// is either signed-in or machine-facing and stays out of search.
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://getdevbrain.com").replace(/\/+$/, "");
export const SITE_PAGES = ["/", "/faq", "/start", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return SITE_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
