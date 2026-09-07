import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE } from "@/lib/cookies";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { WidgetApp } from "./app";
import { loadTeamSnapshot } from "@/lib/desk/load";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // braindump splitter calls Claude from a server action

// /widget — the desktop panel's mini-app. Team-wide glance data plus the
// last-visited repo's brain, handed to a client tab UI (no scrolling on Home).

export default async function WidgetPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: notice } = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=widget");
  const org = await currentOrg();
  if (!org) redirect("/welcome?from=widget");

  const lastRepoId = (await cookies()).get(COOKIE.lastRepo)?.value ?? null;
  const data = await loadTeamSnapshot({ supabase, user, org, lastRepoId, notice });
  return <WidgetApp data={data} />;
}
