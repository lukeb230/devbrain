import { Dot } from "./app-shots";
import { TEAM } from "./mock-team";

// ============================================================================
// The panel's Home tab, recreated for the desktop scene. Every label here is
// a real one from src/app/widget/app.tsx and src/lib/desk/needs-you.ts;
// no-invented-ui.test.ts checks. Pinned, Open handoffs and Claim a lane exist
// in the app and are deliberately left out of the picture.
// ============================================================================

const cut = (s: string) => (s.length > 12 ? `${s.slice(0, 11)}…` : s);

export function PanelWindow({ team = TEAM, className = "" }: { team?: typeof TEAM; className?: string }) {
  return (
    <figure role="img" aria-label="Illustration: the DevBrain panel's Home tab" className={`lp-win w-[440px] bg-ink ${className}`}>
      {/* header: brain mark 20 with glow · DevBrain 15/700 · live dot · team · repo picker · gear */}
      <div className="flex items-center gap-2 bg-row px-4 pb-2 pt-3.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={20} height={16} alt="" style={{ filter: "drop-shadow(0 0 6px rgba(201,85,76,.35))" }} />
        <span className="font-display text-[15px] font-bold text-txt">DevBrain</span>
        <span className="h-1.5 w-1.5 rounded-full bg-go shadow-[0_0_8px_var(--wg-go)]" />
        <span className="ml-auto text-[11.5px] text-faint">{team.team}</span>
        <span className="rounded-[7px] border border-line2 px-2 py-[3px] font-mono text-[11px] text-txt">{team.repo} ▾</span>
        <span className="text-[15px] text-muted">⚙</span>
      </div>
      {/* tabs */}
      <div className="flex border-b border-line bg-row px-4 text-[13px]">
        <span className="border-b-2 border-accent2 px-1 pb-2 pt-1 font-semibold text-accent">Home</span>
        <span className="px-3 pb-2 pt-1 text-muted">Tasks</span>
        <span className="relative px-3 pb-2 pt-1 text-muted">PRs<span className="absolute right-1 top-1.5 h-[5px] w-[5px] rounded-full bg-wait" /></span>
      </div>
      <div className="px-4 pb-4">
        {/* pulse strip, 72px: label as src/app/widget/pulse.tsx renders it */}
        <div className="relative mt-3 h-[72px]">
          <span className="absolute left-0 top-0 font-mono text-[10px] uppercase tracking-[.12em] text-faint">
            last hour · <span className="text-accent">3 people</span> · 3 PR events · collision
          </span>
          <svg viewBox="0 0 412 44" preserveAspectRatio="none" className="absolute left-0 right-0 top-3.5 h-11 w-full" aria-hidden>
            <defs>
              <linearGradient id="wg-pn-g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--wg-accent-strong)" stopOpacity=".22" />
                <stop offset="1" stopColor="var(--wg-accent-strong)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 36 L14 34 L28 35 L43 30 L57 31 L71 27 L85 29 L99 22 L114 24 L128 18 L142 20 L156 14 L170 16 L184 12 L199 15 L213 10 L227 13 L241 9 L255 12 L270 16 L284 11 L298 8 L312 12 L326 10 L341 14 L355 9 L369 12 L383 8 L397 11 L412 10 L412 44 L0 44 Z"
              fill="url(#wg-pn-g)"
            />
            <path
              d="M0 36 L14 34 L28 35 L43 30 L57 31 L71 27 L85 29 L99 22 L114 24 L128 18 L142 20 L156 14 L170 16 L184 12 L199 15 L213 10 L227 13 L241 9 L255 12 L270 16 L284 11 L298 8 L312 12 L326 10 L341 14 L355 9 L369 12 L383 8 L397 11 L412 10"
              fill="none"
              stroke="var(--wg-accent-strong)"
              strokeWidth="1.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <circle cx="128" cy="18" r="3" fill="var(--wg-ink)" stroke="var(--wg-go)" strokeWidth="1.5" />
            <circle cx="255" cy="12" r="3" fill="var(--wg-ink)" stroke="var(--wg-wait)" strokeWidth="1.5" />
            <circle cx="341" cy="14" r="3" fill="var(--wg-ink)" stroke="var(--wg-go)" strokeWidth="1.5" />
            <circle cx="400" cy="11" r="3" fill="var(--wg-stop)" stroke="var(--wg-stop)" strokeWidth="1.5" />
            <line x1="400" y1="8" x2="400" y2="40" stroke="var(--wg-txt)" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
          </svg>
          <div className="absolute bottom-0.5 left-0 right-0 flex justify-between font-mono text-[10px] text-faint">
            <span>−60m</span><span>−30m</span><span>now</span>
          </div>
        </div>
        {/* Needs you 3 */}
        <div className="mt-3 flex items-baseline gap-2 font-display text-[13.5px] font-semibold text-txt">Needs you <span className="text-accenttext">3</span></div>
        {[
          { t: "#133 has conflicts", w: "Auth refactor — resolve against main", a: "Fix", tone: "stop" as const },
          { t: "#128 is cleared to land", w: "cleared to land — press merge", a: "Merge", tone: "go" as const },
          { t: `Handoff from ${team.codex} on chore/coverage`, w: "auth tests need the new fixture", a: "Pick up", tone: "wait" as const },
        ].map((r, i) => (
          <div key={r.t} className={`flex items-center gap-2.5 py-2 ${i ? "border-t border-line" : ""}`}>
            <Dot tone={r.tone} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] text-txt">{r.t}</div>
              <div className="truncate text-[11.5px] text-muted">{r.w}</div>
            </div>
            <span className="rounded-md border border-line2 bg-row px-2 py-[3px] text-[11.5px] font-semibold text-txt">{r.a}</span>
          </div>
        ))}
        {/* four counts */}
        <div className="mt-2 grid grid-cols-4 gap-2">
          {[["3", "PRs", ""], ["1", "conflict", "text-stop"], ["1", "collision", "text-stop"], ["4", "open tasks", ""]].map(([n, l, c]) => (
            <div key={l} className="rounded-lg border border-line bg-row px-2.5 py-2">
              <b className={`font-display text-[20px] font-semibold ${c || "text-txt"}`}>{n}</b>
              <span className="block font-mono text-[10px] text-faint">{l}</span>
            </div>
          ))}
        </div>
        {/* Team now 3 */}
        <div className="mt-4 flex items-baseline gap-2 font-display text-[13.5px] font-semibold text-txt">Team now <span className="text-accenttext">3</span></div>
        {[
          { who: team.cursor, host: "Cursor", what: "refactoring the session guard", since: "since 09:02", me: false, n: 1 },
          { who: team.codex, host: "Codex", what: "adding coverage for the auth fixtures", since: "since 09:41", me: false, n: 1 },
          { who: "you", host: "Claude", what: "wiring the login form", since: "since 09:14", me: true, n: 3 },
        ].map((p, i) => (
          <div key={p.who} className={`flex items-center gap-2.5 py-2 ${i ? "border-t border-line" : ""}`}>
            <span className={`relative grid h-7 w-7 place-items-center rounded-lg text-[11px] font-semibold ${p.me ? "bg-coralink text-accenttext" : "bg-row2 text-txt"}`}>
              {cut(p.who)[0].toUpperCase()}
              {p.n > 1 && <b className="absolute -right-1.5 -top-1.5 rounded-full bg-accent2 px-1 font-mono text-[9px] font-bold text-white">×{p.n}</b>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-txt"><b className="font-semibold">{cut(p.who)}</b> <span className="text-faint">· {p.host}</span></div>
              <div className="truncate text-[11.5px] text-muted">{p.what} <span className="font-mono text-[10.5px] text-faint">{p.since}</span></div>
            </div>
          </div>
        ))}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-line bg-row px-3 py-2 text-[12.5px]">
          <span className="font-semibold text-accent">Open the Console</span>
          <span className="font-mono text-[10px] text-faint">board · PRs · brain · feed · team →</span>
        </div>
      </div>
    </figure>
  );
}
