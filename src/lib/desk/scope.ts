import { cookies } from "next/headers";
import { COOKIE } from "@/lib/cookies";

// ============================================================================
// Repo scope for the Desk — one rule (phase-4 step 0.2):
//   ?repo=<uuid> in the URL wins (the middleware also stamps it into the
//   last-repo cookie), else the cookie, else "all repos".
// Team-wide pages accept null; repo pages render a chooser when it's null.
// ============================================================================

const UUID = /^[0-9a-f-]{36}$/;

export interface DeskScope {
  /** The chosen repo id, or null for team-wide. */
  repoId: string | null;
  /** Where the choice came from — useful in copy ("remembered from last time"). */
  from: "query" | "cookie" | "none";
}

export async function deskScope(searchParams: { repo?: string } | undefined, knownRepoIds: string[]): Promise<DeskScope> {
  const q = searchParams?.repo ?? "";
  if (q === "all") return { repoId: null, from: "query" };
  if (UUID.test(q) && knownRepoIds.includes(q)) return { repoId: q, from: "query" };
  const c = (await cookies()).get(COOKIE.lastRepo)?.value ?? "";
  if (UUID.test(c) && knownRepoIds.includes(c)) return { repoId: c, from: "cookie" };
  return { repoId: null, from: "none" };
}

/** Append the scope to a Desk route so links keep the chosen repo. */
export function withScope(route: string, scope: DeskScope | string | null): string {
  const id = typeof scope === "string" ? scope : scope?.repoId ?? null;
  if (!id) return route;
  return `${route}${route.includes("?") ? "&" : "?"}repo=${id}`;
}
