// ============================================================================
// The hero figure: an edit being stopped.
//
// This replaced a hub-and-spoke diagram. Hub-and-spoke draws CONNECTION —
// three things orbiting a logo — and it is the default dev-infra hero picture,
// used by everyone, decided by nothing. This product's claim is INTERRUPTION,
// which needs the one thing that diagram had no way to show: a before and an
// after, with something stopped in between.
//
// So this reads top to bottom as a sequence: Kai holds a lane, Nova's write
// heads into it, DevBrain stops it. The amber and the stop-red are the app's
// own status vocabulary, and every state is labelled in words as well as
// colour — the previous version encoded the whole point in a 6px dot with no
// legend, which is invisible to a deuteranope and unexplained to everyone.
// ============================================================================

function Dot({ tone }: { tone: "go" | "wait" | "stop" }) {
  const bg = tone === "go" ? "bg-go" : tone === "wait" ? "bg-wait" : "bg-stop";
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${bg}`} />;
}

function Row({ tone, name, host, children }: { tone: "go" | "wait" | "stop"; name: string; host: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-row px-3.5 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,.06)]">
      <div className="flex items-center gap-1.5">
        <Dot tone={tone} />
        <span className="font-display text-[12.5px] font-medium text-txt">{name}</span>
        <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-muted">{host}</span>
      </div>
      <div className="mt-1 font-mono text-[10.5px] leading-[1.5] text-muted">{children}</div>
    </div>
  );
}

export function Constellation() {
  return (
    <figure className="mx-auto w-full max-w-[420px]">
      <div className="grid gap-2">
        <Row tone="wait" name="Kai" host="Cursor">
          holding <span className="text-txt">src/api/**</span> — refactoring the session guard
        </Row>

        <div className="flex items-center gap-2 pl-4" aria-hidden="true">
          <span className="h-5 w-px bg-line2" />
          <span className="font-mono text-[9.5px] uppercase tracking-[.1em] text-muted">meanwhile</span>
        </div>

        <Row tone="go" name="Nova" host="Claude Code">
          about to write <span className="text-txt">src/api/auth.ts</span>
        </Row>

        {/* The interruption. This is the whole figure. */}
        <div className="relative rounded-xl border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-3.5 py-3">
          <div className="flex items-center gap-1.5">
            <Dot tone="stop" />
            <span className="font-display text-[12.5px] font-medium text-stop">Stopped</span>
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brain.png" width={16} height={13} alt="" />
              DevBrain
            </span>
          </div>
          <div className="mt-1 text-[11.5px] leading-[1.5] text-body">
            That file is in Kai&apos;s lane. Coordinate first, or approve it deliberately.
          </div>
        </div>
      </div>

      <figcaption className="mt-3 font-mono text-[9.5px] uppercase tracking-[.1em] text-muted">
        Before the write, not after the merge
      </figcaption>
    </figure>
  );
}
