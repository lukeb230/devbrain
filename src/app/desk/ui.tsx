import type { ReactNode } from "react";

// ============================================================================
// The Desk's building blocks — Direction C v3 "Dusk" (Claude Design handoff,
// 2026-09-08). Every value here is lifted from the design file verbatim
// (sizes in px, weights, radii, paddings); colours go through the .wg tokens
// in globals.css so both themes work. Server-safe: no "use client".
//
//   H1        page head: eyebrow · display 32/500 −.02em · sub 13 muted · right actions
//   Section   h3 display 18/500 with a coral count and a faint hint; hairline rows inside
//   Card      the raised 12px card (bg row, 1px line) — counters, standup, forms
//   Row       hairline list row: title / sub / right, optional status dot
//   Button    primary (coral, white, 600) · ghost (line2 border, 500) · danger · sizes
//   ACTION    12px/600 coral link classes — the row-level verb ("Release", "Pick up")
//   Pill / Light / Chip / Eyebrow / Dot / Switch / Segment / Field / Select / Textarea
//   Banner (wait|stop) · Empty · CodeBlock · Avatar · Kv · Popover
// ============================================================================

export function H1({ eyebrow, eyebrowTone = "faint", title, sub, right, size = 32 }: { eyebrow?: ReactNode; eyebrowTone?: "faint" | "accent" | "violet"; title: ReactNode; sub?: ReactNode; right?: ReactNode; size?: 30 | 32 | 36 }) {
  const eb = { faint: "text-faint", accent: "text-accent2", violet: "text-violet" }[eyebrowTone];
  const h = size === 36 ? "text-[36px] leading-[1.05]" : size === 30 ? "text-[30px] font-bold leading-none tracking-[-.03em]" : "text-[32px] leading-[1.1]";
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        {eyebrow && <div className={`font-mono text-[11px] uppercase tracking-[.1em] ${eb}`}>{eyebrow}</div>}
        <h1 className={`${eyebrow ? "mt-1.5" : ""} font-display font-medium tracking-[-.02em] text-txt ${h}`}>{title}</h1>
        {sub && <p className="mt-2.5 text-[13px] leading-[1.6] text-muted">{sub}</p>}
      </div>
      {right && <div className="flex flex-shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

/** Section head — display 18/500, coral mono count, faint 12px hint. */
export function SectionHead({ title, count, hint, tone, right, className = "" }: { title: ReactNode; count?: ReactNode; hint?: ReactNode; tone?: "go" | "wait" | "stop"; right?: ReactNode; className?: string }) {
  const t = tone ? { go: "text-go", wait: "text-wait", stop: "text-stop" }[tone] : "";
  return (
    <div className={`flex items-baseline gap-2.5 ${className}`}>
      <h3 className={`m-0 font-display text-[18px] font-medium ${t}`}>
        {title}
        {count !== undefined && count !== null && <span className={`ml-1.5 font-mono text-[11px] font-normal ${tone ? "" : "text-accent2"}`}>{count}</span>}
        {hint && <span className="ml-1.5 font-body text-[12px] font-normal text-faint">{hint}</span>}
      </h3>
      {right && <span className="ml-auto text-[12px] text-faint">{right}</span>}
    </div>
  );
}

export function Section({ title, count, hint, tone, right, children, className = "mt-7", sub }: { title?: ReactNode; count?: ReactNode; hint?: ReactNode; tone?: "go" | "wait" | "stop"; right?: ReactNode; children?: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <section className={className}>
      {title && <SectionHead title={title} count={count} hint={hint} tone={tone} right={right} />}
      {sub && <p className="mt-1 text-[12px] text-faint">{sub}</p>}
      {children}
    </section>
  );
}

/** The raised card: 12px radius, row bg, hairline. `pad` matches the design's three paddings. */
export function Card({ children, pad = "md", tone = "row", className = "" }: { children: ReactNode; pad?: "sm" | "md" | "lg" | "none"; tone?: "row" | "coral" | "wait" | "stop"; className?: string }) {
  const p = { sm: "px-[18px] py-4", md: "px-5 py-[18px]", lg: "px-[22px] py-5", none: "" }[pad];
  const t = { row: "border-line bg-row", coral: "border-coralline bg-coralink", wait: "border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)]", stop: "border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)]" }[tone];
  return <div className={`rounded-xl border ${t} ${p} ${className}`}>{children}</div>;
}

/** Hairline list row. `size` md = 14/12.5 with 14px padding (Rules, Members); sm = 13.5/12 with 11px (This Mac, Home). */
export function Row({ dot, glow, title, sub, right, size = "sm", first, className = "", mono }: { dot?: "go" | "wait" | "stop" | "dim"; glow?: boolean; title: ReactNode; sub?: ReactNode; right?: ReactNode; size?: "sm" | "md"; first?: boolean; className?: string; mono?: boolean }) {
  const pad = size === "md" ? "py-3.5" : "py-[11px]";
  const ts = size === "md" ? "text-[14px]" : "text-[13.5px]";
  const ss = size === "md" ? "text-[12.5px] leading-[1.6]" : "text-[12px] leading-[1.55]";
  return (
    <div className={`flex items-center gap-3 ${pad} ${first ? "" : "border-t border-line"} ${className}`}>
      {dot && <Dot level={dot} glow={glow} />}
      <div className="min-w-0 flex-1">
        <div className={`${ts} text-txt`}>{title}</div>
        {sub && <div className={`mt-0.5 ${ss} ${mono ? "font-mono text-[11px]" : ""} text-muted`}>{sub}</div>}
      </div>
      {right && <div className="flex flex-shrink-0 items-center gap-3">{right}</div>}
    </div>
  );
}

export function Dot({ level, glow, size = 7 }: { level: "go" | "wait" | "stop" | "dim" | "draft"; glow?: boolean; size?: 6 | 7 | 8 }) {
  const g = glow ?? (level === "go" || level === "stop");
  const cls = { go: `bg-go ${g ? "shadow-[0_0_8px_var(--wg-go)]" : ""}`, wait: "bg-wait", stop: `bg-stop ${g ? "shadow-[0_0_8px_var(--wg-stop)]" : ""}`, dim: "bg-line2", draft: "border border-faint bg-transparent" }[level];
  const s = size === 8 ? "h-2 w-2" : size === 6 ? "h-1.5 w-1.5" : "h-[7px] w-[7px]";
  return <i className={`inline-block flex-shrink-0 rounded-full ${s} ${cls}`} />;
}

/** Merge light pill: cleared / hold / conflicts (mono 11, 999 radius, status bg). */
export function Light({ state, reason }: { state: string; reason?: string }) {
  const cls = state === "green" ? "bg-[var(--wg-go-bg)] text-go" : state === "red" ? "bg-[var(--wg-stop-bg)] text-stop" : "bg-[var(--wg-wait-bg)] text-wait";
  const word = state === "green" ? "cleared" : state === "red" ? "conflicts" : "hold";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[11px] ${cls}`} title={reason}>
      <i className="h-1.5 w-1.5 rounded-full bg-current" />{word}
    </span>
  );
}

/** 999px pill, mono 11: outline (default) · violet (approved, merge) · solid (selected filter) · muted. */
export function Pill({ children, tone = "outline", className = "" }: { children: ReactNode; tone?: "outline" | "violet" | "solid" | "muted" | "sans"; className?: string }) {
  const cls = { outline: "border border-line2 text-txt font-mono text-[11px]", violet: "bg-violetbg text-violet font-mono text-[11px]", solid: "bg-txt text-ink text-[11.5px]", muted: "border border-line2 text-muted font-mono text-[11px]", sans: "border border-line2 text-txt text-[12px]" }[tone];
  return <span className={`inline-block rounded-full px-2.5 py-[3px] ${cls} ${className}`}>{children}</span>;
}

/** Code chip: 6px radius, row2 bg, mono 11. */
export function Chip({ children, tone = "code", className = "" }: { children: ReactNode; tone?: "code" | "violet" | "muted"; className?: string }) {
  const cls = { code: "bg-row2 text-txt", violet: "bg-violetbg text-violet", muted: "bg-row2 text-muted" }[tone];
  return <code className={`inline-block rounded-md px-2 py-0.5 font-mono text-[11px] ${cls} ${className}`}>{children}</code>;
}

export function Eyebrow({ children, tone = "faint", className = "" }: { children: ReactNode; tone?: "faint" | "accent" | "wait" | "go" | "violet" | "muted"; className?: string }) {
  const t = { faint: "text-faint", accent: "text-accent2", wait: "text-wait", go: "text-go", violet: "text-violet", muted: "text-muted" }[tone];
  return <div className={`font-mono text-[10px] uppercase tracking-[.1em] ${t} ${className}`}>{children}</div>;
}

export function Button({ children, tone = "primary", size = "md", type, title, name, value, formAction, form, disabled, onClick, className = "" }: { children: ReactNode; tone?: "primary" | "ghost" | "danger"; size?: "md" | "sm" | "lg"; type?: "submit" | "button"; title?: string; name?: string; value?: string; formAction?: (fd: FormData) => void | Promise<void>; form?: string; disabled?: boolean; onClick?: () => void; className?: string }) {
  type = type ?? (onClick ? "button" : "submit");
  const t = { primary: "bg-accent2 text-white font-semibold hover:brightness-110", ghost: "border border-line2 bg-row text-txt font-medium hover:border-line3", danger: "border border-[var(--wg-stop-line)] bg-row text-stop font-medium hover:bg-[var(--wg-stop-bg)]" }[tone];
  const s = { md: "px-3.5 py-2 text-[12.5px]", sm: "px-[11px] py-1.5 font-display text-[11.5px] font-semibold", lg: "px-4 py-[9px] text-[12.5px]" }[size];
  return <button type={type} title={title} name={name} value={value} formAction={formAction} form={form} disabled={disabled} onClick={onClick} className={`whitespace-nowrap rounded-lg ${s} ${t} disabled:opacity-50 ${className}`}>{children}</button>;
}

/** The row-level verb — 12px/600 coral (design: <a style="font-size:12px;font-weight:600">). */
export const ACTION = "text-[12px] font-semibold text-accent hover:underline";
export const ACTION_MUTED = "text-[12px] text-faint hover:text-txt";
export const ACTION_STOP = "text-[12px] font-semibold text-stop hover:underline";

/** Visual switch (30×18 Desk rows; 36×22 Rules). Wrap in a form + button for the action. */
export function Switch({ on, size = "sm", disabled }: { on: boolean; size?: "sm" | "lg"; disabled?: boolean }) {
  const w = size === "lg" ? "h-[22px] w-9" : "h-[18px] w-[30px]";
  const k = size === "lg" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5";
  const x = size === "lg" ? (on ? "translate-x-4" : "translate-x-0.5") : on ? "translate-x-3.5" : "translate-x-0.5";
  const knob = size === "lg" ? "bg-ink" : "bg-white";
  return (
    <span className={`inline-flex flex-shrink-0 items-center rounded-full ${w} ${on ? "bg-accent2" : "bg-line2"} ${disabled ? "opacity-50" : ""}`} role="switch" aria-checked={on}>
      <span className={`rounded-full ${k} ${knob} transition ${x}`} />
    </span>
  );
}

/** Segmented control: 8px group, 6px segments, display 11/600; active = row2. */
export function Segment({ options, value, className = "" }: { options: { key: string; label: ReactNode; href?: string; formAction?: (fd: FormData) => void | Promise<void>; name?: string }[]; value: string; className?: string }) {
  return (
    <span className={`inline-flex rounded-lg border border-line2 p-0.5 ${className}`}>
      {options.map((o) => {
        const cls = `rounded-md px-2.5 py-[3px] font-display text-[11px] font-semibold ${o.key === value ? "bg-row2 text-txt" : "text-muted hover:text-txt"}`;
        if (o.href) return <a key={o.key} href={o.href} className={cls}>{o.label}</a>;
        if (o.formAction) return <button key={o.key} formAction={o.formAction} name={o.name} value={o.key} className={cls}>{o.label}</button>;
        return <span key={o.key} className={cls}>{o.label}</span>;
      })}
    </span>
  );
}

const INPUT = "rounded-lg border border-line2 px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";
export function Field({ name, placeholder, required, defaultValue, type = "text", className = "", ground = "row", mono, list, autoFocus }: { name: string; placeholder?: string; required?: boolean; defaultValue?: string; type?: string; className?: string; ground?: "row" | "ink"; mono?: boolean; list?: string; autoFocus?: boolean }) {
  return <input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} list={list} autoFocus={autoFocus} className={`${INPUT} ${ground === "ink" ? "bg-ink" : "bg-row"} ${mono ? "font-mono text-[12px]" : ""} ${className}`} />;
}
export function Select({ name, defaultValue, children, className = "", ground = "row", size = "md" }: { name: string; defaultValue?: string; children: ReactNode; className?: string; ground?: "row" | "ink"; size?: "md" | "sm" }) {
  const s = size === "sm" ? "rounded-md border border-line2 px-2 py-1 text-[12.5px]" : INPUT;
  return <select name={name} defaultValue={defaultValue} className={`${s} text-txt ${ground === "ink" ? "bg-ink" : "bg-row"} ${className}`}>{children}</select>;
}
export function Textarea({ name, placeholder, required, defaultValue, rows = 3, className = "", ground = "ink" }: { name: string; placeholder?: string; required?: boolean; defaultValue?: string; rows?: number; className?: string; ground?: "row" | "ink" }) {
  return <textarea name={name} placeholder={placeholder} required={required} defaultValue={defaultValue} rows={rows} className={`w-full resize-none rounded-lg border border-line2 px-3 py-2.5 text-[13px] leading-[1.5] text-txt placeholder:text-faint focus:border-accent focus:outline-none ${ground === "ink" ? "bg-ink" : "bg-row"} ${className}`} />;
}

export function Empty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`py-2 text-[12.5px] leading-[1.55] text-faint ${className}`}>{children}</p>;
}

/** Alert / notice banner — wait or stop. 10px radius, status bg + line + text. */
export function Banner({ tone, children, right, className = "" }: { tone: "wait" | "stop" | "coral"; children: ReactNode; right?: ReactNode; className?: string }) {
  const t = { wait: "border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] text-wait", stop: "border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] text-stop", coral: "border-coralink bg-coralink text-accent" }[tone];
  return (
    <div className={`flex items-center gap-3 rounded-[10px] border px-3.5 py-2.5 text-[13px] ${t} ${className}`}>
      <span className="min-w-0 flex-1">{children}</span>
      {right}
    </div>
  );
}

export function CodeBlock({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <code className={`block rounded-lg bg-codebg px-3.5 py-2.5 font-mono text-[12px] leading-[1.6] text-codefg ${className}`}>{children}</code>;
}

/** Circle avatar with initial; `me` = coral ink. Optional presence dot and ×N badge. */
export function Avatar({ name, me, size = 28, dot, badge, ground = "pane" }: { name: string; me?: boolean; size?: 26 | 28 | 36; dot?: boolean; badge?: ReactNode; ground?: "pane" | "ink" }) {
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const s = size === 36 ? "h-9 w-9 text-[13px]" : size === 26 ? "h-[26px] w-[26px] text-[11px]" : "h-7 w-7 text-[11px]";
  return (
    <span className={`relative grid flex-shrink-0 place-items-center rounded-full font-semibold ${s} ${me ? "bg-coralink text-accent" : "bg-row2 text-txt"}`}>
      {initial}
      {dot && <i className={`absolute -right-px bottom-0 h-[7px] w-[7px] rounded-full bg-go ${ground === "ink" ? "border-2 border-ink" : "border-2 border-pane"}`} />}
      {badge && <b className="absolute -right-2 -top-[5px] rounded-full bg-accent2 px-1 font-mono text-[9px] font-normal leading-[13px] text-white">{badge}</b>}
    </span>
  );
}

/** Meta cell: eyebrow + value (task drawer's 4-up). */
export function Kv({ k, children, muted }: { k: ReactNode; children: ReactNode; muted?: boolean }) {
  return (
    <div>
      <Eyebrow>{k}</Eyebrow>
      <div className={`mt-1 text-[13px] ${muted ? "text-muted" : "text-txt"}`}>{children}</div>
    </div>
  );
}

/** Popover anchored to a <details> summary (New task, Braindump, Broadcast, Claim, Leave a handoff). */
export function Popover({ label, children, width = 420, tone = "ghost", align = "right" }: { label: ReactNode; children: ReactNode; width?: number; tone?: "ghost" | "primary" | "link"; align?: "right" | "left" }) {
  const s = tone === "primary" ? "rounded-lg bg-accent2 px-3.5 py-2 text-[12.5px] font-semibold text-white" : tone === "link" ? ACTION : "rounded-lg border border-line2 bg-row px-3.5 py-2 text-[12.5px] font-medium text-txt hover:border-line3";
  return (
    <details className="relative">
      <summary className={`cursor-pointer list-none ${s}`}>{label}</summary>
      <div className={`absolute ${align === "right" ? "right-0" : "left-0"} z-20 mt-1.5 flex flex-col gap-2 rounded-xl border border-line2 bg-row p-3.5 shadow-[var(--wg-shadow)]`} style={{ width }}>{children}</div>
    </details>
  );
}

/* Legacy names some pages still import; kept until every page is re-shaped. */
export function PageTitle({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return <div className="mb-6"><H1 title={title} sub={sub} right={right} /></div>;
}
export function LinkButton({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "ghost" }) {
  const cls = tone === "primary" ? "bg-accent2 text-white font-semibold" : "border border-line2 bg-row text-txt font-medium";
  return <span className={`inline-block whitespace-nowrap rounded-lg px-3.5 py-2 text-[12.5px] ${cls}`}>{children}</span>;
}

/** Which agent host a teammate is in — Claude, Cursor or Codex. Mixed teams
 *  are the point of the host layer, so the tag always shows; a person with
 *  several sessions across hosts reads "Claude + Cursor". */
export const HOST_LABEL: Record<string, string> = { "claude-code": "Claude", cursor: "Cursor", codex: "Codex" };
export function HostTag({ hosts }: { hosts: (string | null | undefined)[] }) {
  const set = [...new Set(hosts.map((h) => HOST_LABEL[h ?? "claude-code"] ?? "agent"))];
  return <span className="flex-shrink-0 font-mono text-[10px] text-faint">{set.join(" + ")}</span>;
}
