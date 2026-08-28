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
}: {
  activity: { at: string }[];
  events: { at: string; kind: string }[];
  collision: boolean;
  people: number;
  prEvents: number;
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

  return (
    <div className="relative mx-3.5 mb-1.5 h-11 border-b border-line">
      <span className="absolute left-0 top-0 font-mono text-[10px] tracking-wider text-muted">
        LAST HOUR · <span className="text-brand-400">{people} {people === 1 ? "person" : "people"}</span>
        {prEvents > 0 ? ` · ${prEvents} PR ${prEvents === 1 ? "event" : "events"}` : ""}
        {collision ? " · collision" : ""}
        {quiet && !collision ? " · quiet" : ""}
      </span>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="wg-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e88078" stopOpacity=".22" />
            <stop offset="1" stopColor="#e88078" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="wg-trace-fill" d={area} fill="url(#wg-g)" />
        <path className="wg-trace" d={line} />
        {dots.map((d, i) => (
          <circle key={i} cx={d.x} cy={yAt(d.x)} r="3" fill="#0f1420" stroke={d.kind === "handoff" ? "#f0b652" : d.kind === "broadcast" ? "#f0b652" : "#5ad18e"} strokeWidth="1.5" />
        ))}
        {collision && <circle cx={W - 12} cy={yAt(W - 12)} r="3" fill="#ff5a5f" stroke="#ff5a5f" strokeWidth="1.5" />}
        <line x1={W - 12} y1="8" x2={W - 12} y2={H - 4} stroke="#ece7de" strokeWidth="1" strokeDasharray="2 3" opacity=".6" />
      </svg>
      <div className="absolute bottom-0.5 left-0 right-0 flex justify-between font-mono text-[10px] text-faint">
        <span>−60m</span><span>−30m</span><span>now</span>
      </div>
    </div>
  );
}
