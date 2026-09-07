import { revalidatePath } from "next/cache";

// ============================================================================
// Surfaces — the three places a form can be submitted from:
//
//   /dashboard…   the browser dashboard (retired in phase 5)
//   /widget…      the menu-bar panel (a Tauri webview)
//   /desk…        the Desk window (a Tauri webview)
//
// A server action cannot know which one called it, and a redirect to the
// wrong surface is not a cosmetic bug: each Tauri window refuses navigations
// outside its own surface and hands the URL to the default browser. Every
// Desk form therefore carries a hidden `next` field (see <DeskNext/>), and
// every action that redirects goes through returnTo(). Dashboard and panel
// forms need no change — with no `next` the fallback is today's URL.
// ============================================================================

const ALLOWED = /^\/(desk|widget|dashboard)(\/|\?|$)/;

/** The path the caller wants to return to: the form's `next` if it names a
 *  known surface, else the legacy `stay` flag (panel), else `fallback`. */
export function returnTo(formData: FormData | null | undefined, fallback: string): string {
  const raw = formData?.get("next");
  const s = typeof raw === "string" ? raw : "";
  if (s.startsWith("/") && !s.startsWith("//") && ALLOWED.test(s)) return s;
  if (formData?.get("stay")) return "/widget";
  return fallback;
}

/** Which surface a path belongs to. */
export function surfaceOf(path: string): "desk" | "widget" | "dashboard" {
  if (path.startsWith("/desk")) return "desk";
  if (path.startsWith("/widget")) return "widget";
  return "dashboard";
}

/** The surface's home: where to land when the page you were on no longer
 *  exists (a repo unlinked, a team left). */
export function surfaceRoot(path: string): string {
  return { desk: "/desk", widget: "/widget", dashboard: "/dashboard" }[surfaceOf(path)];
}

/** Append ?error=<code> (same convention as the dashboard's <Notice/>). */
export function withErrorOn(path: string, code: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}error=${code}`;
}

/** Revalidate every surface that shows the affected data. The Desk is one
 *  dynamic layout; the panel is one page; the dashboard paths are passed. */
export function revalidateSurfaces(...dashboardPaths: string[]) {
  for (const p of dashboardPaths) revalidatePath(p);
  revalidatePath("/widget");
  revalidatePath("/desk", "layout");
}
