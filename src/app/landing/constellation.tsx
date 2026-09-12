// ============================================================================
// The hero diagram: three agents, one shared picture.
//
// Not a screenshot and not pretending to be one — a diagram of the thing the
// page claims. Lines are SVG so they sit behind; the nodes are HTML so labels
// render in the real faces and take the theme tokens.
//
// The amber node is the point: Kai is holding a lane, which is why Nova's edit
// into it is the one that stops.
//
// Positions are the CENTRE of each node in percent, and the SVG uses the same
// percentage space (viewBox 0 0 100 100 + preserveAspectRatio="none") so a
// line drawn to a node's coordinates actually lands on the node.
// ============================================================================

const HUB = { x: 50, y: 50 };

const NODES = [
  { x: 24, y: 15, name: "Nova", host: "Claude Code", line: "editing api/auth.ts", tone: "bg-go" },
  { x: 75, y: 13, name: "Kai", host: "Cursor", line: "claimed src/ui/**", tone: "bg-wait" },
  { x: 40, y: 86, name: "Rio", host: "Codex", line: "writing tests", tone: "bg-go" },
] as const;

export function Constellation() {
  return (
    <div className="relative mx-auto aspect-[5/4] w-full max-w-[440px] overflow-hidden" aria-hidden="true">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
        {NODES.map((n) => (
          <line
            key={n.name}
            x1={n.x}
            y1={n.y}
            x2={HUB.x}
            y2={HUB.y}
            stroke="var(--wg-accent)"
            strokeWidth="0.45"
            strokeDasharray="2 2"
            opacity="0.75"
          />
        ))}
      </svg>

      {/* the hub */}
      <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-coralline bg-coralink px-5 py-4 shadow-[0_10px_30px_var(--wg-glow)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brain.png" width={38} height={31} alt="" />
        <div className="font-display text-[13px] font-semibold tracking-[-.01em] text-txt">DevBrain</div>
        <div className="whitespace-nowrap font-mono text-[9px] uppercase tracking-[.1em] text-accent">one shared picture</div>
      </div>

      {/* the agents */}
      {NODES.map((n) => (
        <div
          key={n.name}
          className="absolute w-[44%] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-line bg-row px-3 py-2.5 shadow-[0_4px_14px_rgba(0,0,0,.07)]"
          style={{ left: `${n.x}%`, top: `${n.y}%` }}
        >
          <div className="flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${n.tone}`} />
            <span className="font-display text-[12.5px] font-medium text-txt">{n.name}</span>
            <span className="ml-auto font-mono text-[9px] uppercase tracking-[.08em] text-faint">{n.host}</span>
          </div>
          <div className="mt-1 font-mono text-[10px] text-muted">{n.line}</div>
        </div>
      ))}
    </div>
  );
}
