import { SITE_URL } from "@/lib/site-url";

// Pages the site retired. Middleware answers these with a 308 (permanent).
const MAP: Record<string, string> = { "/how-it-works": "/faq", "/pricing": "/" };
export function siteRedirect(pathname: string): string | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return MAP[p] ?? null;
}

// www.<site host> → <site host>, path and query kept. Only the configured
// site host is folded; previews and the old vercel.app host are left alone.
export function wwwRedirect(host: string | null, url: URL, siteUrl = SITE_URL): string | null {
  if (!host) return null;
  const site = new URL(siteUrl);
  const apex = site.host; // may include a port, e.g. for local/dev site URLs
  const bare = host.replace(/:\d+$/, "").toLowerCase();
  if (bare !== `www.${site.hostname}`) return null;
  const target = new URL(url.toString());
  target.protocol = "https:";
  target.port = "";
  target.host = apex;
  return target.toString();
}
