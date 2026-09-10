import Link from "next/link";
import type { ReactNode } from "react";

// ============================================================================
// The Desk shell's two panes (Dusk): sidebar → LIST PANE (272px, --wg-pane)
// → READING PANE (flex 1, 32px 40px 48px). Pages render both — the list pane
// is contextual per section — as `<><ListPane>…</ListPane><Reading>…</Reading></>`.
// A page with no natural list renders only <Reading>, or the Team sub-nav.
// ============================================================================

export function ListPane({ children, title, count, right, className = "" }: { children?: ReactNode; title?: ReactNode; count?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <aside className={`flex w-[272px] flex-shrink-0 flex-col overflow-y-auto border-r border-line bg-pane ${className}`}>
      {title && (
        <div className="flex items-center gap-2 px-4 pb-2.5 pt-[18px]">
          <span className="font-display text-[18px] font-medium text-txt">{title}</span>
          {count !== undefined && count !== null && <span className="font-mono text-[11px] text-accent2">{count}</span>}
          {right && <span className="ml-auto flex items-center">{right}</span>}
        </div>
      )}
      {children}
    </aside>
  );
}

/** Sub-heading inside the list pane: mono 10 uppercase faint, padded 10/16/4. */
export function PaneEyebrow({ children, tone = "faint", className = "" }: { children: ReactNode; tone?: "faint" | "wait" | "go"; className?: string }) {
  const t = { faint: "text-faint", wait: "text-wait", go: "text-go" }[tone];
  return <div className={`px-4 pb-1 pt-3.5 font-mono text-[10px] uppercase tracking-[.1em] ${t} ${className}`}>{children}</div>;
}

/** Section title inside the list pane below the first (Now working, Restore points…). */
export function PaneTitle({ children, count, className = "" }: { children: ReactNode; count?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-baseline gap-2 px-4 pb-2 pt-[22px] ${className}`}>
      <span className="font-display text-[18px] font-medium text-txt">{children}</span>
      {count !== undefined && <span className="font-mono text-[11px] text-accent2">{count}</span>}
    </div>
  );
}

/** A list-pane row: 8px radius, `margin 0 8px`, selected = row2. Link when href given. */
export function ListRow({ href, selected, children, className = "", dim, pad = "8px 10px" }: { href?: string; selected?: boolean; children: ReactNode; className?: string; dim?: boolean; pad?: string }) {
  const cls = `mx-2 block rounded-lg ${selected ? "bg-row2" : "hover:bg-row"} ${dim ? "text-faint" : "text-txt"} ${className}`;
  const style = { padding: pad };
  if (href) return <Link href={href} className={cls} style={style}>{children}</Link>;
  return <div className={cls} style={style}>{children}</div>;
}

/** Pane search / filter field look (⌕ Search notes…). */
export function PaneSearch({ placeholder, name, defaultValue, action, className = "" }: { placeholder: string; name?: string; defaultValue?: string; action?: string; className?: string }) {
  const inner = (
    <div className={`mx-4 mb-2 flex items-center gap-2 rounded-lg border border-line bg-row px-2.5 py-1.5 text-[12.5px] text-faint ${className}`}>
      <span>⌕</span>
      {name ? <input name={name} defaultValue={defaultValue} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-[12.5px] text-txt placeholder:text-faint focus:outline-none" /> : <span className="flex-1">{placeholder}</span>}
    </div>
  );
  return action ? <form action={action}>{inner}</form> : inner;
}

export function Reading({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <main className={`min-w-0 flex-1 overflow-y-auto px-10 pb-12 pt-8 ${className}`}>{children}</main>;
}

/** The Team group's list pane: a sub-nav with one mono hint per item. */
export function TeamPane({ current, hints = {} }: { current: "rules" | "members" | "tokens" | "team" | "plan" | "reminders" | "mac"; hints?: Partial<Record<"rules" | "members" | "tokens" | "team" | "plan" | "reminders" | "mac", { text: ReactNode; tone?: "muted" | "wait" | "go" }>> }) {
  const items: { key: "rules" | "members" | "tokens" | "team" | "plan" | "reminders" | "mac"; label: string; href: string }[] = [
    { key: "rules", label: "Rules", href: "/desk/rules" },
    { key: "members", label: "Members", href: "/desk/members" },
    { key: "tokens", label: "Tokens & sessions", href: "/desk/tokens" },
    { key: "team", label: "Team settings", href: "/desk/team" },
    { key: "plan", label: "Plan", href: "/desk/plan" },
    { key: "reminders", label: "Reminders", href: "/desk/reminders" },
  ];
  const row = (it: { key: "rules" | "members" | "tokens" | "team" | "plan" | "reminders" | "mac"; label: string; href: string }) => {
    const h = hints[it.key];
    const tone = h?.tone === "wait" ? "text-wait" : h?.tone === "go" ? "text-go" : "text-muted";
    return (
      <Link key={it.key} href={it.href} className={`mx-2 flex items-center justify-between rounded-lg px-2.5 py-[9px] text-[13px] text-txt ${current === it.key ? "bg-row2 font-medium" : "hover:bg-row"}`}>
        {it.label}
        {h && <span className={`font-mono text-[10.5px] ${tone}`}>{h.text}</span>}
      </Link>
    );
  };
  return (
    <ListPane title="Team & this Mac">
      {items.map(row)}
      <div className="mx-4 my-2.5 border-t border-line" />
      {row({ key: "mac", label: "This Mac", href: "/desk/mac" })}
    </ListPane>
  );
}
