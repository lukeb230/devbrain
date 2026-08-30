// Client IP from the platform's proxy headers (Vercel sets x-forwarded-for and
// x-real-ip). Best-effort: an absent header falls back to a single shared
// bucket, so a limiter still bounds total volume even without a per-IP split.
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
