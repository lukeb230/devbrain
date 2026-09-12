// ============================================================================
// The product, rebuilt.
//
// Recreations of DevBrain's real surfaces, at the app's real proportions and
// in its real tokens and faces.
//
// EVERY LABEL HERE IS FROM SOURCE. An earlier version invented section names
// ("Claimed lanes"), cards that do not exist ("Collision prevented", "Recent
// activity") and PR statuses that are not the real light reasons, while the
// sidebar highlighted Board and the pane showed content from Home. When
// editing this file, grep the app for any string you are about to add:
//
//   Home's panes          src/app/desk/page.tsx  (its header comment lists them)
//   pane components       src/app/desk/panes.tsx
//   sidebar sections      src/app/desk/sections.ts
//   PR light reasons      src/lib/traffic.ts
//
// The DATA is synthetic. "Northwind" is not a customer and none of these
// repos, teammates or paths are real: a screenshot of the actual Console
// would put a real team's private work on a public page.
// ============================================================================

export type Tone = "go" | "wait" | "stop" | "idle";
const TONE: Record<Tone, string> = { go: "bg-go", wait: "bg-wait", stop: "bg-stop", idle: "bg-faint" };

export const Dot = ({ tone }: { tone: Tone }) => <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${TONE[tone]}`} />;
const Mono = ({ children }: { children: React.ReactNode }) => <span className="font-mono text-[11.5px]">{children}</span>;

/** macOS title bar: the traffic lights and the window's name. */
function TitleBar({ title, dark }: { title: string; dark?: boolean }) {
  return (
    <div className={`flex h-[34px] items-center gap-2 border-b px-3.5 ${dark ? "border-black/30 bg-[#242019]" : "border-line bg-row"}`}>
      <span className="h-[11px] w-[11px] rounded-full bg-[#ec6a5e]" />
      <span className="h-[11px] w-[11px] rounded-full bg-[#f4bf4f]" />
      <span className="h-[11px] w-[11px] rounded-full bg-[#61c554]" />
      <span className={`mx-auto pr-10 text-[11.5px] font-medium ${dark ? "text-white/65" : "text-muted"}`}>{title}</span>
    </div>
  );
}

const NAV = [
  { g: "Work", items: ["Home", "Board", "Pull requests", "Specs"] },
  { g: "Memory", items: ["Brain", "Feed & memory", "History"] },
  { g: "Settings", items: ["Team", "This Mac"] },
];

/** The Console's Home page. Sidebar 180 · list pane 272 · reading pane. */
export function ConsoleWindow() {
  return (
    <figure className="lp-win bg-ink">
      <TitleBar title="DevBrain Console" />
      <div className="grid min-h-[430px] grid-cols-[180px_272px_minmax(0,1fr)]">
        {/* sidebar */}
        <div className="border-r border-line bg-row px-2 pb-2.5">
          <div className="px-1.5 pb-2 pt-3 font-display text-[19px] font-medium tracking-[-.01em] text-txt">DevBrain</div>
          <div className="px-1.5 py-1 text-[13px] text-txt">Northwind</div>
          <div className="mb-0.5 mt-1.5 rounded-lg border border-line bg-ink px-2 py-[5px] font-mono text-[11.5px] text-muted">northwind/api ▾</div>
          {NAV.map((grp) => (
            <div key={grp.g}>
              <div className="px-2.5 pb-1 pt-2.5 font-mono text-[9px] uppercase tracking-[.12em] text-faint">{grp.g}</div>
              {grp.items.map((it) => (
                <div
                  key={it}
                  className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] ${it === "Home" ? "border-coralline bg-coralink font-semibold text-accenttext" : "border-transparent text-body"}`}
                >
                  {it}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* list pane — Needs you, then Now working (desk/page.tsx) */}
        <div className="overflow-hidden border-r border-line bg-pane">
          <div className="flex items-baseline gap-2 px-4 pb-2.5 pt-[18px]">
            <span className="font-display text-[18px] font-medium text-txt">Needs you</span>
            <span className="font-mono text-[11px] text-accenttext">2</span>
          </div>
          {[
            // Titles match the generators in src/lib/desk/needs-you.ts.
            { t: "stop" as Tone, h: "#133 has conflicts", s: "Auth refactor · 2m ago" },
            { t: "wait" as Tone, h: "Handoff from Rio", s: "auth tests need the new fixture" },
          ].map((r) => (
            <div key={r.h} className={`mx-2 mb-1.5 rounded-lg border-l-[3px] bg-row px-2.5 py-2 ${r.t === "stop" ? "border-l-stop" : "border-l-wait"}`}>
              <div className="text-[12.5px] font-medium leading-[1.35] text-txt">{r.h}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{r.s}</div>
            </div>
          ))}

          <div className="flex items-baseline gap-2 px-4 pb-2 pt-[22px]">
            <span className="font-display text-[18px] font-medium text-txt">Now working</span>
            <span className="font-mono text-[11px] text-accenttext">3</span>
          </div>
          {[
            { t: "wait" as Tone, n: "Kai", s: "cursor · src/api/**", sel: true },
            { t: "go" as Tone, n: "Rio", s: "codex · tests/**" },
            { t: "go" as Tone, n: "Nova", s: "claude code · src/ui/**" },
          ].map((r) => (
            <div key={r.n} className={`mx-2 rounded-lg px-2.5 py-2 ${r.sel ? "bg-row2" : ""}`}>
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-txt"><Dot tone={r.t} />{r.n}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{r.s}</div>
            </div>
          ))}
        </div>

        {/* reading pane — greeting, quick actions, Claimed areas + Open handoffs */}
        <div className="min-w-0">
          <div className="flex h-11 items-center gap-4 border-b border-line bg-pane px-4">
            <span className="max-w-[240px] flex-1 rounded-lg border border-line bg-ink px-2.5 py-[5px] text-[12px] text-faint">⌘K &nbsp;Jump to anything…</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accenttext">L</span>
              <span className="font-mono text-[10.5px] text-muted">lukeb230 · owner</span>
            </span>
          </div>
          <div className="px-7 pb-7 pt-6">
            <p className="font-mono text-[11px] uppercase tracking-[.1em] text-muted">Friday 12 September</p>
            {/* The greeting is one of three fixed strings (desk/greeting.tsx). */}
            <h3 className="mt-1 font-display text-[24px] font-medium tracking-[-.02em] text-txt">Good afternoon</h3>

            <div className="mt-4 flex flex-wrap gap-2">
              {["Claim a lane", "Leave a handoff", "Broadcast"].map((a) => (
                <span key={a} className="rounded-lg border border-line2 bg-row px-3 py-1.5 text-[12.5px] font-medium text-txt">{a}</span>
              ))}
            </div>

            <div className="mt-5 grid gap-3.5 sm:grid-cols-2">
              <div className="rounded-[11px] border border-line bg-row px-4 py-3.5">
                <div className="text-[13px] font-semibold text-txt">Claimed areas</div>
                <div className="mt-2 text-[12.5px] leading-[1.7] text-muted">
                  <span className="font-mono text-[11.5px] text-txt">src/api/**</span> · Kai<br />
                  <span className="font-mono text-[11.5px] text-txt">tests/**</span> · Rio
                </div>
              </div>
              <div className="rounded-[11px] border border-line bg-row px-4 py-3.5">
                <div className="text-[13px] font-semibold text-txt">Open handoffs</div>
                <div className="mt-2 text-[12.5px] leading-[1.7] text-muted">
                  auth fixtures<br />
                  <span className="text-faint">from Rio · unclaimed</span>
                </div>
              </div>
            </div>

            <div className="mt-3.5 rounded-[11px] border border-line bg-row px-4 py-3.5">
              <div className="text-[13px] font-semibold text-txt">Standup</div>
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">
                Rate limiting landed in #128. Kai is part-way through the session guard and has
                <span className="font-mono text-[11.5px] text-txt"> src/api/**</span> held.
              </p>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/** A session as DevBrain holds it. Deliberately NOT framed as the panel:
 *  this is a data card, not a recreation of a surface, because the panel's
 *  real layout (Needs you / Now working) is not what these two show. */
export function SessionCard({ tone, name, host, rows }: { tone: Tone; name: string; host: string; rows: [string, string][] }) {
  return (
    <div className="w-full max-w-[320px] rounded-xl border border-line2 bg-row px-4 py-3.5">
      <div className="flex items-center gap-2 text-[13px] font-semibold text-txt">
        <Dot tone={tone} />{name}
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.09em] text-muted">{host}</span>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="mt-2">
          <div className="text-[12px] text-muted">{k}</div>
          <div className="mt-0.5 font-mono text-[12px] text-txt">{v}</div>
        </div>
      ))}
    </div>
  );
}

/** Pull requests with traffic lights and computed merge order. */
export function PrWindow() {
  return (
    <figure className="lp-win bg-ink">
      <TitleBar title="Pull requests" />
      <div className="px-4 py-3">
        {[
          // Reasons verbatim from src/lib/traffic.ts.
          { t: "go" as Tone, n: "#128", title: "Rate limiting", w: "cleared to land — press merge" },
          { t: "wait" as Tone, n: "#131", title: "Session guard", w: "waiting on a teammate's review" },
          { t: "stop" as Tone, n: "#133", title: "Auth refactor", w: "conflicts with main — resolve before merging" },
        ].map((p) => (
          <div key={p.n} className="flex items-center gap-2.5 border-b border-line py-2.5 text-[12.5px] text-txt last:border-b-0">
            <Dot tone={p.t} />
            <span className="w-11 font-mono text-[11.5px] text-muted">{p.n}</span>
            <span>{p.title}</span>
            <span className="ml-auto truncate pl-3 text-[11.5px] text-muted">{p.w}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
