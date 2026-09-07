import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, LAST_REPO_COOKIE_OPTS } from "@/lib/cookies";
import { retiredRedirect } from "@/lib/retire";

// Refreshes the Supabase auth session cookie on every request so server
// components always see a valid session. Webhook/API ingest routes are
// excluded — they authenticate by signature, bearer token or cron secret,
// not cookies (so the 2-minute tick never pays for a session refresh).
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (
          all: { name: string; value: string; options: CookieOptions }[],
        ) => {
          all.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          all.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  await supabase.auth.getUser();

  // The browser dashboard is retired: old dashboard / settings URLs (in
  // bookmarks, old invites, the CLI) land on /open with their Desk route.
  const retired = retiredRedirect(request.nextUrl.pathname);
  if (retired) {
    const url = request.nextUrl.clone();
    const [path, query] = retired.split("?");
    url.pathname = path;
    url.search = query ? `?${query}` : "";
    const redirect = NextResponse.redirect(url, 308);
    response.cookies.getAll().forEach((c) => redirect.cookies.set(c));
    return redirect;
  }
  // The Desk carries its repo in ?repo=; remember it the same way so the
  // panel and the Desk agree on "the repo you were in".
  if (request.nextUrl.pathname.startsWith("/desk")) {
    const q = request.nextUrl.searchParams.get("repo") ?? "";
    if (/^[0-9a-f-]{36}$/.test(q)) response.cookies.set(COOKIE.lastRepo, q, LAST_REPO_COOKIE_OPTS);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/github|api/v1|api/agents|_next/static|_next/image|favicon.ico).*)"],
};
