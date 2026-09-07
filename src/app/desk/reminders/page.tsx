import { redirect } from "next/navigation";
import { mapList, unmapList } from "@/app/settings/reminders/actions";
import { currentOrg, hasRole } from "@/lib/org";
import { supabaseServer } from "@/lib/supabase/server";
import { ConfirmButton } from "../confirm-button";
import { DeskNext } from "../desk-next";
import { Button, Card, Empty, PageTitle, Row, Select } from "../ui";

// Client-side description of the map that is about to happen; the values come
// from the form itself so the confirm names the real list and repo.
function MapConfirm() {
  return <ConfirmButton label="Map list" describe={describeMap} />;
}
const describeMap = (form: HTMLFormElement) => {
  const list = (form.elements.namedItem("list") as HTMLInputElement | null)?.value ?? "";
  const sel = form.elements.namedItem("repoId") as HTMLSelectElement | null;
  const repo = sel?.selectedOptions[0]?.text ?? "";
  return `Every item on "${list}" becomes a task in ${repo} and stays in sync (every 3 min) until unmapped.`;
};

// ============================================================================
// Desk · Reminders — each shared Apple Reminders list feeds one repo's board.
// Mapping is team-wide (admins edit); any teammate's Mac running the app
// does the syncing. Same map / unmap actions as the dashboard.
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

export default async function DeskReminders({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/?from=desk");
  const org = await currentOrg();
  if (!org) redirect("/welcome");
  const isAdmin = hasRole(org.role, "admin");

  const [{ data: sources }, { data: sightings }, { data: repos }] = await Promise.all([
    supabase.from("reminder_sources").select("id, list_name, created_by, created_at, repo_id, linked_repos(full_name)").order("list_name"),
    supabase.from("reminder_sightings").select("list_name, seen_by, item_count, last_seen").order("list_name"),
    supabase.from("linked_repos").select("id, full_name").eq("org_id", org.orgId).is("unlinked_at", null).order("full_name"),
  ]);
  const mapped = new Set((sources ?? []).map((s) => s.list_name.toLowerCase()));
  const unmapped = (sightings ?? []).filter((s) => !mapped.has(s.list_name.toLowerCase()));
  const repoName = (s: { linked_repos: unknown }) => (s.linked_repos as { full_name: string } | null)?.full_name ?? "(unlinked repo)";

  return (
    <>
      <PageTitle title="Reminders" sub="Add a reminder on your phone — or “Hey Siri, add … to my Team Inbox list” — and it becomes a task on that repo's board within a few minutes. Checking it off completes the task." />
      <Card title="Mapped lists" count={(sources ?? []).length}>
        {(sources ?? []).length === 0 ? <Empty>No lists are mapped yet.</Empty> : (sources ?? []).map((s) => (
          <Row key={s.id} title={s.list_name} sub={`→ ${repoName(s)} · mapped by ${s.created_by ?? "?"} ${ago(s.created_at)}`} right={isAdmin && <form action={unmapList}><DeskNext /><input type="hidden" name="id" value={s.id} /><button className="font-display text-[11.5px] font-semibold text-stop/80 hover:text-stop">unmap</button></form>} />
        ))}
      </Card>
      <Card title="Map a list" right={isAdmin ? undefined : "admins map lists"}>
        {isAdmin ? (
          <form action={mapList} className="flex items-center gap-2">
            <DeskNext />
            <input name="list" required placeholder="Exact list name, e.g. Team Inbox" list="seen-lists" className="w-full rounded-lg border border-line2 bg-ink px-2.5 py-1.5 text-[12px] text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none" />
            <datalist id="seen-lists">{unmapped.map((s) => <option key={s.list_name} value={s.list_name} />)}</datalist>
            <Select name="repoId" defaultValue="">
              <option value="" disabled>repo…</option>
              {(repos ?? []).map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
            </Select>
            <MapConfirm />
          </form>
        ) : (
          <Empty>Ask a team admin to map a list.</Empty>
        )}
        {unmapped.length > 0 && (
          <div className="mt-2">
            <div className="font-display text-[9.5px] uppercase tracking-[.14em] text-muted">Lists seen on teammates&apos; Macs, not mapped</div>
            {unmapped.map((s) => <Row key={s.list_name} title={s.list_name} sub={`${typeof s.item_count === "number" ? `${s.item_count} items · ` : ""}seen by ${s.seen_by} ${ago(s.last_seen)}`} />)}
          </div>
        )}
      </Card>
      <Card title="This Mac">
        <p className="text-[12px] text-muted">The DevBrain app on this Mac syncs every mapped list every 3 minutes while it runs, using the Reminders permission you granted it. Turn syncing on or off in the panel&apos;s Settings.</p>
      </Card>
      {sp.error && <p className="mt-2 text-[11.5px] text-wait">That didn&apos;t go through ({sp.error}).</p>}
    </>
  );
}
