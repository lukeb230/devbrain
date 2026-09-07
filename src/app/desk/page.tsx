import { redirect } from "next/navigation";
import { currentOrg } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { DeskPlaceholder } from "./placeholder";

// Desk Home (phase 3 shell). Shows enough live data to prove the window is
// signed in and scoped; the Needs-you inbox and the rest arrive in phase 4.
export default async function DeskHome({ searchParams }: { searchParams: Promise<{ repo?: string }> }) {
  const { repo } = await searchParams;
  // The layout redirects when signed out, but Next renders pages in parallel
  // with layouts — so this page must not assume a team either.
  const org = await currentOrg();
  if (!org) redirect("/?from=desk");
  const supabase = await supabaseServer();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [{ count: openPrs }, { count: openTasks }, { count: live }] = await Promise.all([
    supabase.from("prs").select("number", { count: "exact", head: true }).eq("org_id", org.orgId).eq("state", "open"),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).neq("status", "done"),
    supabase.from("sessions").select("id", { count: "exact", head: true }).eq("org_id", org.orgId).is("ended_at", null).gte("last_seen", since),
  ]);

  return (
    <>
      <h1 className="font-display text-[21px] font-bold tracking-tight">Home</h1>
      <p className="mb-4 text-[12px] text-muted">
        {org.orgName}
        {repo ? " · one repo" : " · all repos"} · signed in as {org.login}
      </p>
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[
          ["open PRs", openPrs ?? 0],
          ["open tasks", openTasks ?? 0],
          ["people live", live ?? 0],
        ].map(([label, n]) => (
          <div key={String(label)} className="rounded-xl border border-line bg-row px-3.5 py-3">
            <div className="font-mono text-[22px] text-txt">{n}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>
      <DeskPlaceholder slug="" />
    </>
  );
}
