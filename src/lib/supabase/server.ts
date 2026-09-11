import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Per-request client bound to the signed-in user's cookies (RLS applies). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          all: { name: string; value: string; options: CookieOptions }[],
        ) => {
          try {
            all.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — safe to ignore; middleware
            // handles session refresh.
          }
        },
      },
    },
  );
}

/** Service-role client — server-only, bypasses RLS. Used by webhook/ingest
 *  routes that authenticate by other means (webhook signature, dev token). */
export function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** The signed-in user, once per request, verified WITHOUT a network call.
 *
 *  getClaims() checks the access token's ES256 signature locally against the
 *  project's cached JWKS (this project uses asymmetric signing keys), so the
 *  Console no longer pays a round trip to Supabase Auth on every navigation —
 *  it was the first of four sequential waves before anything could render.
 *  Falls back to getUser() if the token cannot be verified locally. */
export const currentUser = cache(async (): Promise<AuthedUser | null> => {
  const supabase = await supabaseServer();
  try {
    const { data, error } = await supabase.auth.getClaims();
    const c = data?.claims as { sub?: string; email?: string; user_metadata?: Record<string, unknown> } | undefined;
    if (!error && c?.sub) return { id: c.sub, email: c.email ?? null, user_metadata: c.user_metadata ?? {} };
  } catch { /* fall through to the auth server */ }
  const { data: { user } } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email ?? null, user_metadata: (user.user_metadata ?? {}) as Record<string, unknown> } : null;
});

/** What every caller of currentUser() actually reads. */
export interface AuthedUser {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
}
