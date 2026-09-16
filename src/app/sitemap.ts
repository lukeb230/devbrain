import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

// The public site. Everything else (the Console, the widget, auth, the API)
// is either signed-in or machine-facing and stays out of search.
export { SITE_URL };
export const SITE_PAGES = ["/", "/faq", "/support", "/start", "/terms", "/privacy"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_PAGES.map((path) => ({
    url: `${SITE_URL}${path}`,
    changeFrequency: path === "/" ? "weekly" : "monthly",
    priority: path === "/" ? 1 : 0.6,
  }));
}
