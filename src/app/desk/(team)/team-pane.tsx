"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ListPane } from "../panes";

// The Team group's list pane. Lives in the group LAYOUT so it never reloads
// while you move between Rules, Members, Tokens, Team settings, Plan and
// Reminders; the current row follows the URL, and every row is prefetched so
// a click is a swap, not a fetch.
export type TeamKey = "rules" | "members" | "tokens" | "team" | "plan" | "reminders";
const ITEMS: { key: TeamKey; label: string; href: string }[] = [
  { key: "rules", label: "Rules", href: "/desk/rules" },
  { key: "members", label: "Members", href: "/desk/members" },
  { key: "tokens", label: "Tokens & sessions", href: "/desk/tokens" },
  { key: "team", label: "Team settings", href: "/desk/team" },
  { key: "plan", label: "Plan", href: "/desk/plan" },
  { key: "reminders", label: "Reminders", href: "/desk/reminders" },
];

export function TeamPane({ hints = {} }: { hints?: Partial<Record<TeamKey | "mac", { text: ReactNode; tone?: "muted" | "wait" | "go" }>> }) {
  const pathname = usePathname();
  const current = (pathname.replace(/^\/desk\/?/, "").split("/")[0] ?? "") as TeamKey;
  return (
    <ListPane title="Team">
      {ITEMS.map((it) => {
        const h = hints[it.key];
        const tone = h?.tone === "wait" ? "text-wait" : h?.tone === "go" ? "text-go" : "text-muted";
        return (
          <Link key={it.key} href={it.href} prefetch className={`mx-2 flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13px] text-txt ${current === it.key ? "bg-row2 font-medium" : "hover:bg-row"}`}>
            {it.label}
            {h && <span className={`font-mono text-[10.5px] ${tone}`}>{h.text}</span>}
          </Link>
        );
      })}
    </ListPane>
  );
}
