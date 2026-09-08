// The Desk's sections — the one list the sidebar reads. A plain module (no
// "use client"): a client module's non-component exports become client
// references on the server. No icons (Dusk): labels only.

export const DESK_SECTIONS: { group: string; items: { slug: string; label: string }[] }[] = [
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
    items: [
      { slug: "rules", label: "Rules" },
      { slug: "members", label: "Members" },
      { slug: "tokens", label: "Tokens & sessions" },
      { slug: "team", label: "Team settings" },
      { slug: "reminders", label: "Reminders" },
    ],
  },
  {
    group: "This Mac",
    items: [{ slug: "mac", label: "This Mac" }],
  },
];
