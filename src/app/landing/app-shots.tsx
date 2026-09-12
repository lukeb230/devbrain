// ============================================================================
// The product, rebuilt.
//
// These are faithful recreations of DevBrain's real surfaces — the Console
// (src/app/desk/layout.tsx, nav.tsx, panes.tsx), the panel, and an agent's
// terminal — at the app's real proportions, in the app's real tokens and
// faces. The page argues by showing the product; earlier versions drew
// abstract shapes instead, which is what made them read as generic.
//
// The data is SYNTHETIC. "Northwind" is not a customer and none of these
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

/** The Console. Sidebar 180 · list pane 272 · reading pane — the real shell. */
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
                  className={`rounded-lg border px-2.5 py-1.5 text-[12.5px] ${it === "Board" ? "border-coralline bg-coralink font-semibold text-accenttext" : "border-transparent text-body"}`}
                >
                  {it}
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* list pane */}
        <div className="overflow-hidden border-r border-line bg-pane">
          <div className="flex items-baseline gap-2 px-4 pb-2.5 pt-[18px]">
            <span className="font-display text-[18px] font-medium text-txt">Now working</span>
            <span className="font-mono text-[11px] text-accenttext">3</span>
          </div>
          {[
            { t: "wait" as Tone, n: "Kai", s: "cursor · src/api/**", sel: true },
            { t: "go" as Tone, n: "Rio", s: "codex · tests/**" },
            { t: "stop" as Tone, n: "Nova", s: "claude code · stopped" },
          ].map((r) => (
            <div key={r.n} className={`mx-2 rounded-lg px-2.5 py-2 ${r.sel ? "bg-row2" : ""}`}>
              <div className="flex items-center gap-2 text-[12.5px] font-medium text-txt"><Dot tone={r.t} />{r.n}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{r.s}</div>
            </div>
          ))}
          <div className="px-4 pb-1 pt-3.5 font-mono text-[10px] uppercase tracking-[.1em] text-faint">Claimed lanes</div>
          {[["src/api/**", "Kai · 24 min"], ["tests/**", "Rio · 8 min"]].map(([a, b]) => (
            <div key={a} className="mx-2 rounded-lg px-2.5 py-2">
              <div className="text-[12.5px] font-medium text-txt">{a}</div>
              <div className="mt-0.5 font-mono text-[11px] text-muted">{b}</div>
            </div>
          ))}
          <div className="px-4 pb-1 pt-3.5 font-mono text-[10px] uppercase tracking-[.1em] text-faint">Handoffs</div>
          <div className="mx-2 rounded-lg px-2.5 py-2">
            <div className="text-[12.5px] font-medium text-txt">auth fixtures</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">from Rio · unclaimed</div>
          </div>
        </div>

        {/* reading pane */}
        <div className="min-w-0">
          <div className="flex h-11 items-center gap-4 border-b border-line bg-pane px-4">
            <span className="max-w-[240px] flex-1 rounded-lg border border-line bg-ink px-2.5 py-[5px] text-[12px] text-faint">⌘K &nbsp;Jump to anything…</span>
            <span className="ml-auto flex items-center gap-2">
              <span className="grid h-[26px] w-[26px] place-items-center rounded-full bg-coralink text-[11px] font-semibold text-accenttext">L</span>
              <span className="font-mono text-[10.5px] text-muted">lukeb230 · owner</span>
            </span>
          </div>
          <div className="px-7 pb-7 pt-6">
            <h3 className="font-display text-[24px] font-medium tracking-[-.02em] text-txt">Kai · session guard</h3>
            <p className="mt-1.5 text-[13px] text-muted">cursor · branch <Mono>refactor/session-guard</Mono> · started 24 minutes ago</p>

            <div className="lp-interrupt mt-3.5 rounded-[11px] border border-coralline bg-coralink px-4 py-3.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-accenttext">
                <Dot tone="stop" />Collision prevented
                <span className="ml-auto rounded-full border border-current px-2 py-0.5 font-mono text-[10px] uppercase tracking-[.08em]">just now</span>
              </div>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-body">
                Nova tried to write <Mono>src/api/auth.ts</Mono>, inside Kai&apos;s claimed lane. The edit was stopped before the write and Nova was told why.
              </p>
            </div>

            <div className="mt-3.5 rounded-[11px] border border-line bg-row px-4 py-3.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-txt"><Dot tone="wait" />Claimed <Mono>src/api/**</Mono></div>
              <p className="mt-1.5 text-[12.5px] leading-[1.55] text-muted">Released when the session ends, or when Kai calls release_claim.</p>
            </div>

            <div className="mt-3.5 rounded-[11px] border border-line bg-row px-4 py-3.5">
              <div className="text-[13px] font-semibold text-txt">Recent activity</div>
              <p className="mt-1.5 font-mono text-[11.5px] leading-[1.75] text-muted">
                14:02 edited src/api/session.ts<br />13:58 edited src/api/guard.ts<br />13:51 claimed src/api/**
              </p>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}

/** The 440px panel, as it sits over your editor. */
export function PanelWindow({ tone, name, host, rows }: { tone: Tone; name: string; host: string; rows: [string, string][] }) {
  return (
    <figure className="lp-win w-full max-w-[320px] bg-ink">
      <div className="flex items-center gap-2 border-b border-line bg-row px-3.5 py-2.5 text-[12.5px] font-semibold text-txt">
        <Dot tone={tone} />{name} · {host}
      </div>
      <div className="px-3.5 py-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="py-1.5">
            <div className="text-[12.5px] font-medium text-txt">{k}</div>
            <div className="mt-0.5 font-mono text-[11px] text-muted">{v}</div>
          </div>
        ))}
      </div>
    </figure>
  );
}

/** An agent's terminal. */
export function TerminalWindow({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) {
  return (
    <div>
      <figure className="lp-win bg-codebg">
        <TitleBar title={title} dark />
        <pre className="overflow-x-auto whitespace-pre-wrap px-5 py-5 font-mono text-[12px] leading-[1.8] text-codefg sm:text-[12.5px]">{children}</pre>
      </figure>
      {caption && <figcaption className="mt-3 font-mono text-[12px] text-muted">{caption}</figcaption>}
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
          { t: "go" as Tone, n: "#128", title: "Rate limiting", w: "merge first" },
          { t: "wait" as Tone, n: "#131", title: "Session guard", w: "waits on #128" },
          { t: "stop" as Tone, n: "#133", title: "Auth refactor", w: "overlaps #131" },
        ].map((p) => (
          <div key={p.n} className="flex items-center gap-2.5 border-b border-line py-2.5 text-[12.5px] text-txt last:border-b-0">
            <Dot tone={p.t} />
            <span className="w-11 font-mono text-[11.5px] text-muted">{p.n}</span>
            <span>{p.title}</span>
            <span className="ml-auto text-[11.5px] text-muted">{p.w}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
