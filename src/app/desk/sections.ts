// The Desk's sections — the one list the sidebar reads. A plain module (no
// "use client"): a client module's non-component exports become client
// references on the server. No icons (Dusk): labels only.
//
// Team is ONE sidebar entry: its pages (Rules, Members, Tokens & sessions,
// Team settings, Plan, Reminders) live in the Team list pane, so the sidebar
// never repeats them. `also` lists the routes that keep the entry lit.

export const DESK_SECTIONS: { group: string; items: { slug: string; label: string; also?: string[] }[] }[] = [
  {
    group: "Work",
    items: [
      { slug: "", label: "Home" },
      { slug: "board", label: "Board" },
      { slug: "prs", label: "Pull requests" },
      { slug: "specs", label: "Specs" },
    ],
  },
  {
    group: "Memory",
    items: [
      { slug: "brain", label: "Brain" },
      { slug: "feed", label: "Feed & memory" },
      { slug: "history", label: "History" },
    ],
  },
  {
    group: "Team",
    items: [{ slug: "team", label: "Team", also: ["rules", "members", "tokens", "plan", "reminders"] }],
  },
  {
    group: "This Mac",
    items: [{ slug: "mac", label: "This Mac" }],
  },
];

/** Every page, for the ⌘K palette (the Team pages included). */
export const DESK_PAGES: { slug: string; label: string; group: string }[] = [
  ...DESK_SECTIONS.flatMap((g) => g.items.filter((it) => it.slug !== "team").map((it) => ({ slug: it.slug, label: it.label, group: g.group }))),
  { slug: "rules", label: "Rules", group: "Team" },
  { slug: "members", label: "Members", group: "Team" },
  { slug: "tokens", label: "Tokens & sessions", group: "Team" },
  { slug: "team", label: "Team settings", group: "Team" },
  { slug: "plan", label: "Plan", group: "Team" },
  { slug: "reminders", label: "Reminders", group: "Team" },
];
