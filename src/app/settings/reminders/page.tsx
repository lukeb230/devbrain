import { redirect } from "next/navigation";
import { AppNav } from "@/components/AppNav";
import { supabaseServer } from "@/lib/supabase/server";
import { mapList, unmapList } from "./actions";

export const dynamic = "force-dynamic";

// Settings → Reminders: which Apple Reminders lists feed which repos. The
// mapping lives here, for the whole team; every Mac running DevBrain syncs
// the mapped lists it can see. Lists seen on any Mac but not mapped are
// offered for mapping.

export default async function RemindersSettingsPage() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const [{ data: sources }, { data: sightings }, { data: repos }] = await Promise.all([
    supabase.from("reminder_sources").select("id, list_name, created_by, created_at, repo_id, linked_repos(full_name)").order("list_name"),
    supabase.from("reminder_sightings").select("list_name, seen_by, item_count, last_seen").order("list_name"),
    supabase.from("linked_repos").select("id, full_name").order("full_name"),
  ]);
  const mapped = new Set((sources ?? []).map((s) => s.list_name.toLowerCase()));
  const unmapped = (sightings ?? []).filter((s) => !mapped.has(s.list_name.toLowerCase()));
  const repoName = (s: { linked_repos: unknown }) => (s.linked_repos as { full_name: string } | null)?.full_name ?? "(unlinked repo)";

  return (
    <>
      <AppNav />
      <main className="mx-auto max-w-4xl px-6 py-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">Reminders</h1>
        <p className="mb-5 mt-1 max-w-2xl text-sm text-slate-500">
          Each shared Apple Reminders list feeds one repo&apos;s task board. Add a reminder on your phone — or
          &ldquo;Hey Siri, add … to my <em>Team Inbox</em> list&rdquo; — and it becomes a task within a few minutes.
          Checking it off completes the task. Any teammate&apos;s Mac running the DevBrain app does the syncing;
          the mapping below is shared by the whole team, so it can never be split across repos.
        </p>

        <section className="card mb-6">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Mapped lists</h2>
          </div>
          {!sources || sources.length === 0 ? (
            <p className="px-4 py-4 text-sm text-slate-500">No lists are mapped yet. Map one below.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {sources.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{s.list_name}</div>
                    <div className="text-xs text-slate-500">
                      → <span className="font-mono">{repoName(s)}</span>
                      {s.created_by ? ` · mapped by ${s.created_by}` : ""}
                    </div>
                  </div>
                  <form action={unmapList}>
                    <input type="hidden" name="id" value={s.id} />
                    <button className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-red-300 hover:text-red-700">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card mb-6">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="font-semibold text-slate-900">Map a list</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Lists seen on teammates&apos; Macs appear in the picker; you can also type a name exactly as it appears in Reminders.
            </p>
          </div>
          <form action={mapList} className="flex flex-wrap items-end gap-3 px-4 py-4">
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Reminders list</span>
              <input
                name="list"
                list="seen-lists"
                required
                placeholder="Team Inbox"
                className="w-56 rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none"
              />
              <datalist id="seen-lists">
                {unmapped.map((s) => (
                  <option key={s.list_name} value={s.list_name}>
                    {s.item_count != null ? `${s.item_count} items · seen by ${s.seen_by ?? "?"}` : s.seen_by ?? ""}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block text-slate-500">Feeds repo</span>
              <select name="repoId" required className="w-64 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm focus:border-brand-500 focus:outline-none">
                {(repos ?? []).map((r) => (
                  <option key={r.id} value={r.id}>{r.full_name}</option>
                ))}
              </select>
            </label>
            <button className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700">Map list</button>
          </form>
          {unmapped.length > 0 && (
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              Seen but not mapped: {unmapped.map((s) => s.list_name).join(" · ")}
            </div>
          )}
          {(!sightings || sightings.length === 0) && (
            <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
              No Mac has reported its lists yet — open the DevBrain app on a Mac with Reminders sync enabled and check back in a few minutes.
            </div>
          )}
        </section>

        <p className="text-xs text-slate-500">
          Conventions in a reminder title: <code className="rounded bg-slate-100 px-1">@name</code> assigns,{" "}
          <code className="rounded bg-slate-100 px-1">#tag</code> tags; Low / Medium / High priority → P3 / P2 / P1.
          Deleting a reminder does not delete the task; completing does complete it.
        </p>
      </main>
    </>
  );
}
