import type { MetadataRoute } from "next";
import { SITE_URL } from "./sitemap";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api/", "/desk/", "/auth/", "/widget/", "/open", "/download", "/join/", "/welcome", "/settings/", "/dashboard/", "/billing/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
