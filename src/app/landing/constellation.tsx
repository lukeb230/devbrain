// ============================================================================
// The hero figure: an edit being stopped, drawn the way the app draws it.
//
// Three rows on the instrument's own surfaces, with the status vocabulary the
// product already uses — amber holds, green works, red stops. The connector
// drops from the write into the interrupt on arrival; that is the page's one
// authored moment, and nothing is hidden at rest, so a reader who lands after
// it has played misses nothing.
// ============================================================================

function Dot({ tone }: { tone: "go" | "wait" | "stop" }) {
  return <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${tone === "go" ? "bg-go" : tone === "wait" ? "bg-wait" : "bg-stop"}`} />;
}

function Row({ tone, name, host, children, className = "" }: { tone: "go" | "wait" | "stop"; name: string; host: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-row px-3.5 py-3 ${className}`}>
      <div className="flex items-center gap-2">
        <Dot tone={tone} />
        <span className="text-[13px] font-medium text-txt">{name}</span>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[.09em] text-muted">{host}</span>
      </div>
      <div className="mt-1.5 text-[12.5px] leading-[1.5] text-muted">{children}</div>
    </div>
  );
}

const Path = ({ label }: { label: string }) => (
  <div className="flex items-stretch gap-3 py-1 pl-5" aria-hidden="true">
    <div className="relative w-px bg-line2">
      <span className="lp-drop absolute inset-x-0 top-0 block bg-accent/50" />
    </div>
    <span className="self-center font-mono text-[10px] uppercase tracking-[.1em] text-muted">{label}</span>
  </div>
);

export function Constellation() {
  return (
    <figure className="mx-auto w-full max-w-[430px]">
      <Row tone="wait" name="Kai" host="Cursor">
        holding <span className="font-mono text-[12px] text-body">src/api/**</span> — refactoring the session guard
      </Row>

      <Path label="meanwhile" />

      <Row tone="go" name="Nova" host="Claude Code">
        about to write <span className="font-mono text-[12px] text-body">src/api/auth.ts</span>
      </Row>

      <Path label="before the write" />

      <div className="lp-interrupt rounded-lg border border-stop/45 bg-stop/[.07] px-3.5 py-3">
        <div className="flex items-center gap-2">
          <Dot tone="stop" />
          <span className="text-[13px] font-medium text-stop">Stopped</span>
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[.09em] text-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brain.png" width={15} height={12} alt="" />
            DevBrain
          </span>
        </div>
        <div className="mt-1.5 text-[12.5px] leading-[1.5] text-body">
          That file is in Kai&apos;s lane. Coordinate first, or approve it deliberately.
        </div>
      </div>
    </figure>
  );
}
