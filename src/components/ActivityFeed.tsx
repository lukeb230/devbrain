// ============================================================================
// ActivityFeed — the human-readable activity list.
//
// Raw activity rows are one-file-per-row (perfect for Claudes, noise for
// humans). This groups them into work entries: one line per person + task
// phrase — "maya — adding light/dark mode · 6 files · 2m ago" — with the
// exact files tucked behind a click (native <details>, zero JS, so it
// server-renders and stays live via the realtime refresh).
//
// The task phrase is the session's `update_status` snapshot stored on each
// row at edit time. Fallbacks (old rows / no status): the branch name.
// ============================================================================

export type ActivityRow = {
  session_id?: string | null;
  dev_label?: string | null;
  label?: string | null;
  branch?: string | null;
  file: string;
  tool?: string | null;
  at: string;
  repo?: string | null; // set on the team home, where the feed spans repos
};

type Group = {
  key: string;
  dev: string | null;
  label: string | null;
  branch: string | null;
  repo: string | null;
  latest: string;
  files: { file: string; tool: string; at: string }[];
};

function timeAgo(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export function groupActivity(rows: ActivityRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const r of rows) {
    // One entry per person + task phrase (falling back to branch). A status
    // change mid-session starts a new entry, which is exactly what we want.
    const who = r.dev_label ?? r.session_id ?? "?";
    const what = r.label ?? r.branch ?? "";
    const key = `${r.repo ?? ""}|${who}|${what}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        dev: r.dev_label ?? null,
        label: r.label ?? null,
        branch: r.branch ?? null,
        repo: r.repo ?? null,
        latest: r.at,
        files: [],
      });
    }
    const g = groups.get(key)!;
    if (new Date(r.at) > new Date(g.latest)) g.latest = r.at;
    const existing = g.files.find((f) => f.file === r.file);
    if (existing) {
      // Keep "write" (created) sticky — a file created then edited is still new.
      if (r.tool === "write") existing.tool = "write";
      if (new Date(r.at) > new Date(existing.at)) existing.at = r.at;
    } else {
      g.files.push({ file: r.file, tool: r.tool ?? "edit", at: r.at });
    }
  }
  return [...groups.values()].sort(
    (a, b) => new Date(b.latest).getTime() - new Date(a.latest).getTime(),
  );
}

export function ActivityFeed({ rows, limit = 12 }: { rows: ActivityRow[]; limit?: number }) {
  const groups = groupActivity(rows).slice(0, limit);
  if (groups.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {groups.map((g) => {
        const created = g.files.filter((f) => f.tool === "write").length;
        return (
          <li key={g.key}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-baseline gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▸</span>
                <span className="min-w-0 truncate">
                  {g.repo && (
                    <span className="mr-1.5 text-xs text-slate-400">{g.repo.split("/")[1] ?? g.repo}</span>
                  )}
                  {g.dev && <span className="font-medium text-slate-900">{g.dev}</span>}
                  {g.label ? (
                    <span className="text-slate-700"> — {g.label}</span>
                  ) : (
                    <span className="text-slate-500">
                      {g.dev ? " worked on " : "activity on "}
                      <code className="text-slate-700">{g.branch ?? "?"}</code>
                    </span>
                  )}
                </span>
                <span className="ml-auto flex-shrink-0 text-xs text-slate-400">
                  {g.files.length} file{g.files.length === 1 ? "" : "s"}
                  {created > 0 ? ` (${created} new)` : ""} · {timeAgo(g.latest)}
                </span>
              </summary>
              <ul className="mb-1.5 ml-7 mt-1 space-y-0.5">
                {g.files.map((f) => (
                  <li key={f.file} className="flex items-baseline gap-2 text-xs">
                    <code className="truncate text-slate-600">{f.file}</code>
                    <span className="flex-shrink-0 text-slate-400">
                      {f.tool === "write" ? "created" : "edited"} · {timeAgo(f.at)}
                    </span>
                  </li>
                ))}
                {g.branch && (
                  <li className="pt-0.5 text-xs text-slate-400">on {g.branch}</li>
                )}
              </ul>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
