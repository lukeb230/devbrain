// ============================================================================
// Needs-you — the list at the top of the panel's Home and the Desk's Home:
// what wants THIS person's attention, in urgency order. One pure builder so
// the two surfaces show the same list by construction (phase-4 rule 4).
//
// Inputs are the already-scoped snapshot slices; the surface renders each
// item's `action` its own way (a link, a button, a form). Order: the items
// are collected in a fixed sequence and then stably sorted stop → go → wait,
// exactly as the panel has always done.
// ============================================================================

export type NeedLevel = "stop" | "go" | "wait";

export type NeedAction =
  | { kind: "github"; url: string | null; label: "Fix" | "Merge" }
  | { kind: "tab"; tab: "PRs" | "Tasks"; label: "Look" | "Confirm"; route: string }
  | { kind: "start_task"; repoId: string; taskId: string; label: "Start" }
  | { kind: "pickup_handoff"; repoId: string; handoffId: string; label: "Pick up" };

export interface Need {
  key: string;
  level: NeedLevel;
  title: string;
  why: string;
  action: NeedAction;
}

export interface NeedsInput {
  /** The viewer's login/label (case-insensitive match). */
  self: string | null;
  scopeAll: boolean;
  prs: { number: number; title: string; author: string | null; mergeable_state: string | null; html_url: string | null; defaultBranch: string; light: { state: string; reason: string } | null }[];
  tasks: { id: string; repo_id: string; title: string; priority: number; assigned_to: string | null; status: string; started_by: string | null; maybe_done_pr: number | null; created_by: string | null; created_at: string }[];
  claims: { dev_label: string; paths: string[] }[];
  collisions: { repo: string; file: string; branches: string[] }[];
  handoffs: { id: string; repo_id: string; by: string | null; branch: string | null; summary: string }[];
  /** Relative-time formatter, supplied by the surface so copy matches it. */
  fmtAgo: (iso: string) => string;
}

const ORDER: Record<NeedLevel, number> = { stop: 0, go: 1, wait: 2 };

export function buildNeeds(input: NeedsInput): Need[] {
  const { self, scopeAll, prs, tasks, claims, collisions, handoffs, fmtAgo } = input;
  const isMe = (name: string | null | undefined) => Boolean(self && name && name.toLowerCase() === self.toLowerCase());
  const open = tasks.filter((t) => t.status === "open");
  const needs: Need[] = [];

  for (const pr of prs) {
    if (isMe(pr.author) && pr.mergeable_state === "dirty") {
      needs.push({ key: `pr-conflict-${pr.number}`, level: "stop", title: `#${pr.number} has conflicts`, why: `${pr.title} — resolve against ${pr.defaultBranch}`, action: { kind: "github", url: pr.html_url, label: "Fix" } });
    }
  }
  const myPaths = claims.filter((c) => isMe(c.dev_label)).flatMap((c) => c.paths.map((p) => p.replace(/\/$/, "")));
  for (const c of collisions) {
    const mine = myPaths.some((p) => c.file.startsWith(p));
    const short = c.file.split("/").pop();
    needs.push({
      key: `collision-${c.repo}-${c.file}`,
      level: mine ? "stop" : "wait",
      title: mine ? `Your lane is contested — ${short}` : `Collision — ${short}`,
      why: `${c.branches.join(" + ")}${scopeAll ? ` · ${c.repo}` : ""}`,
      action: { kind: "tab", tab: "PRs", label: "Look", route: "/prs" },
    });
  }
  for (const pr of prs) {
    if (isMe(pr.author) && pr.light?.state === "green") {
      needs.push({ key: `pr-green-${pr.number}`, level: "go", title: `#${pr.number} is cleared to land`, why: pr.light.reason, action: { kind: "github", url: pr.html_url, label: "Merge" } });
    }
  }
  for (const t of open) {
    if (t.priority === 1 && isMe(t.assigned_to) && !t.started_by) {
      needs.push({ key: `p1-${t.id}`, level: "wait", title: `P1 assigned to you — ${t.title}`, why: `${t.created_by ?? "?"} · ${fmtAgo(t.created_at)}`, action: { kind: "start_task", repoId: t.repo_id, taskId: t.id, label: "Start" } });
    }
  }
  for (const t of open) {
    if (t.maybe_done_pr && isMe(t.assigned_to)) {
      needs.push({ key: `maybe-${t.id}`, level: "wait", title: `Possibly done — ${t.title}`, why: `PR #${t.maybe_done_pr} looks like it closed it`, action: { kind: "tab", tab: "Tasks", label: "Confirm", route: `/board?task=${t.id}` } });
    }
  }
  for (const h of handoffs) {
    if (!isMe(h.by)) {
      needs.push({ key: `handoff-${h.id}`, level: "wait", title: `Handoff from ${h.by}${h.branch ? ` on ${h.branch}` : ""}`, why: h.summary, action: { kind: "pickup_handoff", repoId: h.repo_id, handoffId: h.id, label: "Pick up" } });
    }
  }

  // Stable: Array.prototype.sort is stable in every supported runtime.
  return needs.sort((x, y) => ORDER[x.level] - ORDER[y.level]);
}

/** The badge level the panel emits: the most urgent open need, or idle. */
export function needsLevel(needs: Need[]): NeedLevel | "idle" {
  return needs[0]?.level ?? "idle";
}
