import type { ReactNode } from "react";

// ============================================================================
// The Desk's building blocks — structure, not aesthetics (phase-4 step 0.4).
// Plain server-safe components over the existing `wg` tokens so every Desk
// page looks like one app and the phase-6 restyle happens in this one file.
// No data exports here (a client module's non-component exports become client
// references on the server); this file has no "use client" at all.
// ============================================================================

export function Card({ title, count, right, children, className = "" }: { title?: ReactNode; count?: number | string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`mb-2.5 rounded-xl border border-line bg-row px-3.5 py-3 ${className}`}>
      {(title || right) && (
        <header className="mb-2 flex items-baseline gap-2">
          {title && <h3 className="font-display text-[10px] font-semibold uppercase tracking-[.14em] text-muted">{title}</h3>}
          {count !== undefined && <span className="font-mono text-[10px] text-brand-400">{count}</span>}
          {right && <span className="ml-auto text-[11px] text-faint">{right}</span>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Row({ dot, title, sub, right, className = "" }: { dot?: "go" | "wait" | "stop" | "dim"; title: ReactNode; sub?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 border-t border-line py-2 first:border-t-0 ${className}`}>
      {dot && <Dot level={dot} />}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12.5px] text-txt">{title}</div>
        {sub && <div className="truncate text-[10.5px] text-muted">{sub}</div>}
      </div>
      {right && <div className="flex flex-shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
}

export function Dot({ level }: { level: "go" | "wait" | "stop" | "dim" }) {
  const cls = { go: "bg-go shadow-[0_0_8px_var(--wg-go)]", wait: "bg-wait", stop: "bg-stop shadow-[0_0_8px_var(--wg-stop)]", dim: "bg-line2" }[level];
  return <span className={`inline-block h-[7px] w-[7px] flex-shrink-0 rounded-full ${cls}`} />;
}

export function Light({ state, reason }: { state: string; reason?: string }) {
  const cls = state === "green" ? "text-go bg-[var(--wg-go-bg)] border-[var(--wg-go-line)]" : state === "red" ? "text-stop bg-[var(--wg-stop-bg)] border-[var(--wg-stop-line)]" : "text-wait bg-[var(--wg-wait-bg)] border-[var(--wg-wait-line)]";
  const word = state === "green" ? "cleared" : state === "red" ? "conflicts" : "hold";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] ${cls}`} title={reason}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{word}
    </span>
  );
}

export function Chip({ children, tone = "code" }: { children: ReactNode; tone?: "code" | "violet" | "muted" }) {
  const cls = { code: "text-[var(--wg-code)] border-line2 bg-row2", violet: "text-[var(--wg-violet)] border-[var(--wg-violet-line)] bg-[var(--wg-violet-bg)]", muted: "text-muted border-line2 bg-row2" }[tone];
  return <span className={`inline-block rounded border px-1.5 font-mono text-[9.5px] ${cls}`}>{children}</span>;
}

export function Button({ children, tone = "primary", type = "submit", title }: { children: ReactNode; tone?: "primary" | "ghost" | "danger"; type?: "submit" | "button"; title?: string }) {
  const cls = { primary: "bg-brand-600 text-white hover:bg-brand-700", ghost: "border border-line2 text-muted hover:border-muted hover:text-txt", danger: "border border-[var(--wg-stop-line)] text-stop hover:bg-[var(--wg-stop-bg)]" }[tone];
  return <button type={type} title={title} className={`rounded-lg px-3 py-1.5 font-display text-[11.5px] font-semibold ${cls}`}>{children}</button>;
}

export function LinkButton({ children, tone = "primary" }: { children: ReactNode; tone?: "primary" | "ghost" }) {
  // Styling only — wrap in an <a> or <Link>.
  const cls = tone === "primary" ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-line2 text-muted hover:border-muted hover:text-txt";
  return <span className={`inline-block rounded-lg px-3 py-1.5 font-display text-[11.5px] font-semibold ${cls}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-[12px] text-faint">{children}</p>;
}

export function PageTitle({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-[21px] font-bold tracking-tight">{title}</h1>
        {right && <div className="ml-auto flex items-center gap-1.5">{right}</div>}
      </div>
      {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
}

export function Field({ name, placeholder, required, defaultValue, type = "text", className = "" }: { name: string; placeholder?: string; required?: boolean; defaultValue?: string; type?: string; className?: string }) {
  return <input name={name} type={type} placeholder={placeholder} required={required} defaultValue={defaultValue} className={`w-full rounded-lg border border-line2 bg-ink px-2.5 py-1.5 text-[12px] text-txt placeholder:text-faint focus:border-brand-500 focus:outline-none ${className}`} />;
}

export function Select({ name, defaultValue, children, className = "" }: { name: string; defaultValue?: string; children: ReactNode; className?: string }) {
  return <select name={name} defaultValue={defaultValue} className={`rounded-lg border border-line2 bg-ink px-2 py-1.5 text-[12px] text-txt ${className}`}>{children}</select>;
}
