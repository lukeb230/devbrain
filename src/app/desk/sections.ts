// The Desk's sections — one list that the sidebar, the placeholder and the
// [section] route all read. A plain module (no "use client"): a client
// module's non-component exports become client references on the server,
// which is not an array you can flatMap.

export const DESK_SECTIONS: { group: string; items: { slug: string; label: string; icon: string; arrives: string }[] }[] = [
  {
    group: "Work",
    items: [
      { slug: "", label: "Home", icon: "⌂", arrives: "Needs-you inbox, who's working, claims, handoffs, today's standup" },
      { slug: "board", label: "Board", icon: "☑", arrives: "Every task and lane: create, edit, assign, pin, braindump, possibly-done" },
      { slug: "prs", label: "Pull requests", icon: "⇅", arrives: "Lights with reasons, merge order, AI review points, rebase help" },
      { slug: "specs", label: "Specs", icon: "▤", arrives: "Upload a spec, items → tasks, dismiss / restore" },
    ],
  },
  {
    group: "Memory",
    items: [
      { slug: "brain", label: "Brain", icon: "◉", arrives: "The repo's notes as a graph, reading pane, stale-note repairs" },
      { slug: "feed", label: "Feed & memory", icon: "≣", arrives: "Decisions, broadcasts, journals, standup archive, team memory search" },
      { slug: "history", label: "History", icon: "↺", arrives: "What landed on main, restore points, revert (via the Rules switch)" },
    ],
  },
  {
    group: "Team",
    items: [
      { slug: "rules", label: "Rules", icon: "⚙", arrives: "Team rules, features, and the 'act on GitHub' switches" },
      { slug: "members", label: "Members", icon: "◌", arrives: "Roles, invites" },
      { slug: "tokens", label: "Tokens & sessions", icon: "⌘", arrives: "Dev tokens, spawned sessions" },
      { slug: "team", label: "Team settings", icon: "▣", arrives: "Name, AI usage, alerts, leave / delete" },
      { slug: "reminders", label: "Reminders", icon: "☰", arrives: "Apple Reminders list → repo mapping" },
    ],
  },
  {
    group: "This Mac",
    items: [{ slug: "mac", label: "This Mac", icon: "▢", arrives: "Install health, Dock and login preferences, update" }],
  },
];
