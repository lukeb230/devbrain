"use client";

import { useState } from "react";

// Task title + description that expands on click. Descriptions are clamped
// (2 lines on the dashboard, 1 in the widget) so the board stays scannable;
// clicking anywhere on the text toggles the full text. Only renders a hint
// when there is actually more to show, so short tasks don't look clickable.

export function TaskBody({
  title,
  detail,
  size = "md",
}: {
  title: string;
  detail: string | null;
  /** md = dashboard board, sm = widget */
  size?: "md" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(detail && detail.trim());
  // Heuristic: only treat as expandable when the text could plausibly exceed
  // the clamp (long, or multi-line). Avoids a "more" hint on one-liners.
  const long = hasDetail && ((detail as string).length > (size === "sm" ? 70 : 160) || /\n/.test(detail as string));
  const expandable = long || (size === "sm" && title.length > 60);

  const titleCls = size === "sm" ? "text-xs font-medium text-slate-900" : "text-sm font-medium text-slate-900";
  const detailCls = size === "sm" ? "text-[10px] leading-snug text-slate-500" : "text-xs leading-relaxed text-slate-500";
  const clamp = size === "sm" ? "line-clamp-1" : "line-clamp-2";

  return (
    <div
      className={"min-w-0 flex-1 " + (expandable ? "cursor-pointer select-text" : "")}
      onClick={expandable ? () => setOpen((o) => !o) : undefined}
      role={expandable ? "button" : undefined}
      tabIndex={expandable ? 0 : undefined}
      onKeyDown={expandable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen((o) => !o); } } : undefined}
      aria-expanded={expandable ? open : undefined}
      title={expandable && !open ? "Click to expand" : undefined}
    >
      <div className={titleCls + (open ? "" : " truncate")}>{title}</div>
      {hasDetail && (
        <div className={detailCls + (open ? " whitespace-pre-line" : " " + clamp)}>{detail}</div>
      )}
      {expandable && (
        <div className={"mt-0.5 text-brand-600 " + (size === "sm" ? "text-[10px]" : "text-[11px]")}>
          {open ? "less" : "more"}
        </div>
      )}
    </div>
  );
}
