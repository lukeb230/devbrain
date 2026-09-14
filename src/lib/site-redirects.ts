// Pages the site retired. Middleware answers these with a 308 (permanent).
const MAP: Record<string, string> = { "/how-it-works": "/faq", "/pricing": "/" };
export function siteRedirect(pathname: string): string | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return MAP[p] ?? null;
}
