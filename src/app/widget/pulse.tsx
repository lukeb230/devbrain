"use client";

// The pulse strip — the team's last hour as a trace. The line is file
// activity per two-minute bucket; dots are events (decisions, broadcasts,
// handoffs); a red dot at "now" means a collision is live. Draws in when the
// panel opens; reduced-motion renders it static. Pure presentation.

const MINUTES = 60;
const BUCKET = 2;
const W = 412;
const H = 44;

export function Pulse({
  activity,
  events,
  collision,
  people,
  prEvents,
  variant = "panel",
}: {
  activity: { at: string }[];
  events: { at: string; kind: string }[];
  collision: boolean;
  people: number;
  prEvents: number;
  /** "desk": the Dusk card variant — eyebrow row with the axis inline, 56px trace, coral-ink fill. */
  variant?: "panel" | "desk";
}) {
  const now = Date.now();
  const since = now - MINUTES * 60_000;
  const n = MINUTES / BUCKET;
  const counts = new Array<number>(n).fill(0);
  for (const a of activity) {
    const t = new Date(a.at).getTime();
    if (t < since || t > now) continue;
    counts[Math.min(n - 1, Math.floor((t - since) / (BUCKET * 60_000)))]++;
  }
  const max = Math.max(1, ...counts);
  const x = (i: number) => (i / (n - 1)) * W;
  const y = (c: number) => H - 8 - (c / max) * (H - 18);
  const pts = counts.map((c, i) => `${x(i).toFixed(1)} ${y(c).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${W} ${H} L0 ${H} Z`;
  const xAt = (iso: string) => {
    const t = new Date(iso).getTime();
    if (t < since || t > now) return null;
    return ((t - since) / (MINUTES * 60_000)) * W;
  };
  const yAt = (px: number) => {
    const i = Math.round((px / W) * (n - 1));
    return y(counts[Math.max(0, Math.min(n - 1, i))]);
  };
  const dots = events.map((e) => ({ x: xAt(e.at), kind: e.kind })).filter((d): d is { x: number; kind: string } => d.x !== null);
  const quiet = counts.every((c) => c === 0) && dots.length === 0;

  if (variant === "desk") {
    return (
      <div className="rounded-xl border border-line bg-row px-[18px] py-4">
        <div className="flex items-baseline font-mono text-[10.5px] uppercase tracking-[.08em] text-muted">
          last hour · <span className="ml-1 text-accent2">{people} {people === 1 ? "person" : "people"}</span>
          {prEvents > 0 ? ` · ${prEvents} PR ${prEvents === 1 ? "event" : "events"}` : ""}
          {collision ? " · collision" : ""}
          {quiet && !collision ? " · quiet" : ""}
          <span className="ml-auto text-faint">−60m · −30m · now</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block h-14 w-full" aria-hidden>
          <path className="wg-trace-fill" d={area} fill="var(--wg-coral-ink)" />
          <path className="wg-trace" d={line} />
          {dots.map((d, i) => (
            <circle key={i} cx={d.x} cy={yAt(d.x)} r="2" fill="var(--wg-row)" stroke={d.kind === "handoff" || d.kind === "broadcast" ? "var(--wg-wait)" : "var(--wg-go)"} strokeWidth="1" />
          ))}
          {collision && <circle cx={W - 8} cy={yAt(W - 8)} r="2" fill="var(--wg-stop)" />}
        </svg>
      </div>
    );
  }
  return (
    <div className="relative mt-3 h-[58px]">
      <span className="absolute left-0 top-0 font-mono text-[10px] uppercase tracking-[.12em] text-faint">
        last hour · <span className="text-accent">{people} {people === 1 ? "person" : "people"}</span>
        {prEvents > 0 ? ` · ${prEvents} PR ${prEvents === 1 ? "event" : "events"}` : ""}
        {collision ? " · collision" : ""}
        {quiet && !collision ? " · quiet" : ""}
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute left-0 right-0 top-3.5 h-11 w-full" aria-hidden>
        <defs>
          <linearGradient id="wg-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--wg-accent-strong)" stopOpacity=".22" />
            <stop offset="1" stopColor="var(--wg-accent-strong)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="wg-trace-fill" d={area} fill="url(#wg-g)" />
        <path className="wg-trace" d={line} />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={yAt(d.x)} r="3" fill="var(--wg-ink)" stroke={d.kind === "handoff" || d.kind === "broadcast" ? "var(--wg-wait)" : "var(--wg-go)"} strokeWidth="1.5" />
        ))}
        {collision && <circle cx={W - 12} cy={yAt(W - 12)} r="3" fill="var(--wg-stop)" stroke="var(--wg-stop)" strokeWidth="1.5" />}
        <line x1={W - 12} y1="8" x2={W - 12} y2={H - 4} stroke="var(--wg-txt)" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
      </svg>
      <div className="absolute bottom-0.5 left-0 right-0 flex justify-between font-mono text-[10px] text-faint">
        <span>−60m</span><span>−30m</span><span>now</span>
      </div>
    </div>
  );
}
