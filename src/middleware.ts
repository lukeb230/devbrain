import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Refreshes the Supabase auth session cookie on every request so server
// components always see a valid session. Webhook/API ingest routes are
// excluded — they authenticate by signature or bearer token, not cookies.
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

  // Remember the last repo the user visited so the desktop widget (and
  // /widget) can open straight to it instead of the team home.
  const m = request.nextUrl.pathname.match(/^\/dashboard\/([0-9a-f-]{36})/);
  if (m) {
    response.cookies.set("devbrain_last_repo", m[1], {
      maxAge: 60 * 60 * 24 * 90,
      sameSite: "lax",
      path: "/",
    });
  }
  return response;
}

export const config = {
  matcher: ["/((?!api/github|api/v1|_next/static|_next/image|favicon.ico).*)"],
};
