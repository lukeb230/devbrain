"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// ============================================================================
// Picker — the app's own dropdown (Dusk), replacing the native <select> for
// the team and repo switchers in the Desk and the panel. A trigger showing
// the current value with a chevron opens a popover list: row bg, hairline,
// 10px radius, the current item ticked in coral, an optional footer link.
// Keyboard: ↑ ↓ move, Enter picks, Esc closes; click-away closes. No
// dependency; the same shell the gear menu uses.
// ============================================================================

export type PickerItem = { key: string; label: ReactNode; hint?: ReactNode; disabled?: boolean };

export function Picker({
  items,
  value,
  onPick,
  label,
  footer,
  size = "md",
  align = "left",
  width = 220,
  className = "",
  title,
}: {
  items: PickerItem[];
  value: string;
  onPick: (key: string) => void;
  /** What the trigger shows; defaults to the current item's label. */
  label?: ReactNode;
  /** A last row under a hairline (e.g. "Link a repo ↗"); rendered as given. */
  footer?: ReactNode;
  /** md = Desk sidebar (13px); sm = panel header (mono 11px in a bordered chip). */
  size?: "md" | "sm";
  align?: "left" | "right";
  width?: number;
  className?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const root = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const current = items.find((i) => i.key === value);

  useEffect(() => {
    if (!open) return;
    setCursor(Math.max(0, items.findIndex((i) => i.key === value)));
    const away = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", key); };
  }, [open, items, value]);

  const pick = (k: string) => { setOpen(false); if (k !== value) onPick(k); };
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpen(true); } return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); const it = items[cursor]; if (it && !it.disabled) pick(it.key); }
  };

  const trigger = size === "sm"
    ? "inline-flex max-w-[160px] items-center gap-1 rounded-md border border-line2 bg-ink px-1.5 py-[3px] font-mono text-[11px] text-txt hover:border-line3"
    : "inline-flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[13px] text-txt hover:bg-row2";

  return (
    <div ref={root} className={`relative ${className}`} onKeyDown={onKey}>
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} title={title} onClick={() => setOpen((o) => !o)} className={trigger}>
        <span className="min-w-0 truncate">{label ?? current?.label ?? "—"}</span>
        <span className={`flex-shrink-0 text-[10px] ${size === "sm" ? "text-muted" : "text-faint"}`} aria-hidden>▾</span>
      </button>
      {open && (
        <div id={id} role="listbox" className={`absolute z-30 mt-1 rounded-[10px] border border-line2 bg-row p-1.5 shadow-[var(--wg-shadow)] ${align === "right" ? "right-0" : "left-0"}`} style={{ width }}>
          {items.map((it, i) => {
            const on = it.key === value;
            return (
              <button
                key={it.key}
                type="button"
                role="option"
                aria-selected={on}
                disabled={it.disabled}
                onMouseEnter={() => setCursor(i)}
                onClick={() => pick(it.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] ${i === cursor ? "bg-row2" : ""} ${it.disabled ? "text-faint" : "text-txt"}`}
              >
                <span className="min-w-0 flex-1 truncate">{it.label}</span>
                {it.hint && <span className="font-mono text-[10.5px] text-muted">{it.hint}</span>}
                {on && <span className="font-mono text-[11px] text-accent" aria-hidden>✓</span>}
              </button>
            );
          })}
          {footer && <div className="mt-1 border-t border-line pt-1">{footer}</div>}
        </div>
      )}
    </div>
  );
}
