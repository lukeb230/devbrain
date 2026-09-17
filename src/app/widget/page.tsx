import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { WidgetApp } from "./app";
import { NoTeamPanel } from "./no-team";
import { loadTeamSnapshot } from "@/lib/desk/load";
import { withSentryUser } from "@/lib/sentry-scope";
import { SentryUser } from "@/components/SentryUser";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // braindump splitter calls Claude from a server action

// /widget — the desktop panel's mini-app. Team-wide glance data plus the
// last-visited repo's brain, handed to a client tab UI (no scrolling on Home).

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: notice } = await searchParams;
  const supabase = await supabaseServer();
  const user = await currentUser();
  if (!user) redirect("/?from=widget");
  const org = await currentOrg();
  if (!org) return <NoTeamPanel />;
  withSentryUser({ userId: user.id, orgId: org.orgId, path: "/widget", userAgent: (await headers()).get("user-agent") });

  const lastRepoId = (await cookies()).get(COOKIE.lastRepo)?.value ?? null;
  const data = await loadTeamSnapshot({ supabase, user, org, lastRepoId, notice });
  return <><SentryUser userId={user.id} orgId={org.orgId} /><WidgetApp data={data} /></>;
}
