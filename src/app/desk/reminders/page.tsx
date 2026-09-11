import Link from "next/link";
import { redirect } from "next/navigation";
import { mapList, unmapList } from "@/app/settings/reminders/actions";
import { teamHints } from "@/lib/desk/team-hints";
import { currentOrg, hasRole } from "@/lib/org";
import { currentUser, supabaseServer } from "@/lib/supabase/server";
import { DeskNext } from "../desk-next";
import { Reading, TeamPane } from "../panes";
import { ACTION, ACTION_STOP, Empty, Section, Select } from "../ui";
import { MapConfirm } from "./map-confirm";

// ============================================================================
// Desk · Reminders (Dusk) — Mapped lists (unmap) and Seen on teammates' Macs
// (map →) on the left; the Map a list card (two-step confirm) and the This
// Mac note on the right. Mapping is team-wide (admins edit); any teammate's
// Mac running the app does the syncing.
// ============================================================================

export const dynamic = "force-dynamic";

function ago(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export default async function DeskReminders({ searchParams }: { searchParams: Promise<{ error?: string; list?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const user = await currentUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const isAdmin = hasRole(org.role, "admin");

  const [{ data: sources }, { data: sightings }, { data: repos }, hints] = await Promise.all([
    supabase.from("reminder_sources").select("id, list_name, created_by, created_at, repo_id, linked_repos(full_name)").order("list_name"),
    supabase.from("reminder_sightings").select("list_name, seen_by, item_count, last_seen").order("list_name"),
    supabase.from("linked_repos").select("id, full_name").eq("org_id", org.orgId).is("unlinked_at", null).order("full_name"),
    teamHints(org.orgId, user.id, null),
  ]);
  const mapped = new Set((sources ?? []).map((s) => s.list_name.toLowerCase()));
  const unmapped = (sightings ?? []).filter((s) => !mapped.has(s.list_name.toLowerCase()));
  const repoName = (s: { linked_repos: unknown }) => (s.linked_repos as { full_name: string } | null)?.full_name ?? "(unlinked repo)";

  return (
    <>
      <TeamPane current="reminders" hints={hints} />
      <Reading>
        <h1 className="font-display text-[32px] font-medium tracking-[-.02em] text-txt">Reminders</h1>
        <p className="mt-2 max-w-[620px] text-[13px] leading-[1.6] text-muted">Add a reminder on your phone — or “Hey Siri, add … to my Team Inbox list” — and it becomes a task on that repo&apos;s board within a few minutes. Checking it off completes the task.</p>

        <div className="mt-6 grid grid-cols-2 gap-7">
          <div>
            <Section className="" title="Mapped lists" count={(sources ?? []).length}>
              <div className="mt-2.5">
                {(sources ?? []).length === 0 ? <Empty className="border-y border-line">No lists are mapped yet.</Empty> : (sources ?? []).map((s, i) => (
                  <div key={s.id} className={`flex items-center gap-3 border-t border-line py-3 ${i === (sources?.length ?? 0) - 1 ? "border-b" : ""}`}>
                    <div className="flex-1">
                      <div className="text-[14px] text-txt">{s.list_name} <span className="text-faint">→</span> <span className="font-mono text-[12px]">{repoName(s)}</span></div>
                      <div className="mt-0.5 text-[12px] text-muted">mapped by {s.created_by ?? "?"} {ago(s.created_at)} · syncs every 3 min</div>
                    </div>
                    {isAdmin && <form action={unmapList}><DeskNext /><input type="hidden" name="id" value={s.id} /><button className={ACTION_STOP}>unmap</button></form>}
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Seen on teammates' Macs, not mapped">
              <div className="mt-2.5">
                {unmapped.length === 0 ? <Empty className="border-y border-line">Nothing new — every list a teammate&apos;s Mac has seen is mapped.</Empty> : unmapped.map((s, i) => (
                  <div key={s.list_name} className={`flex items-center gap-3 border-t border-line py-3 ${i === unmapped.length - 1 ? "border-b" : ""}`}>
                    <div className="flex-1">
                      <div className="text-[14px] text-txt">{s.list_name}</div>
                      <div className="mt-0.5 text-[12px] text-muted">{typeof s.item_count === "number" ? `${s.item_count} items · ` : ""}seen by {s.seen_by} {ago(s.last_seen)}</div>
                    </div>
                    {isAdmin && <Link href={`/desk/reminders?list=${encodeURIComponent(s.list_name)}`} className={ACTION}>map →</Link>}
                  </div>
                ))}
              </div>
            </Section>
          </div>
          <div>
            <section className="rounded-xl border border-line bg-row px-5 py-[18px]">
              <h3 className="m-0 font-display text-[18px] font-medium text-txt">Map a list</h3>
              {isAdmin ? (
                <form action={mapList} className="mt-3 flex flex-col gap-2">
                  <DeskNext />
                  <input name="list" required defaultValue={sp.list ?? ""} placeholder="Exact list name, e.g. Team Inbox" list="seen-lists" className="rounded-lg border border-line2 bg-ink px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
                  <datalist id="seen-lists">{unmapped.map((s) => <option key={s.list_name} value={s.list_name} />)}</datalist>
                  <Select name="repoId" defaultValue="" ground="ink">
                    <option value="" disabled>repo…</option>
                    {(repos ?? []).map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
                  </Select>
                  <div className="self-start"><MapConfirm /></div>
                </form>
              ) : (
                <p className="mt-3 text-[12.5px] text-faint">Ask a team admin to map a list.</p>
              )}
              <p className="mt-2.5 text-[12px] leading-[1.6] text-faint">Asks once before it starts: every item on the list becomes a task and stays in sync until unmapped.</p>
            </section>
            <Section title="This Mac" className="mt-5">
              <p className="mt-2 text-[12.5px] leading-[1.6] text-muted">The DevBrain app on this Mac syncs every mapped list every 3 minutes while it runs, using the Reminders permission you granted it. Turn syncing on or off under <Link href="/desk/mac" className="text-accent hover:underline">This Mac</Link>.</p>
            </Section>
          </div>
        </div>
        {sp.error && <p className="mt-4 text-[12px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
      </Reading>
    </>
  );
}
