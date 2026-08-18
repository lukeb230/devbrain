"use client";

// Obsidian-style graph: force-directed layout, click a dot to open its note.
// Zero dependencies — a small custom force simulation, precomputed with a
// short animated settle so clusters visibly form.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

export interface GNode {
  slug: string;
  title: string;
  type: string;
  degree: number;
}
export interface GEdge {
  a: string;
  b: string;
}

// Light-mode palette: saturated-but-tasteful marks that hold up on white.
export const GRAPH_COLORS: Record<string, string> = {
  overview: "#0d9488",
  feature: "#059669",
  module: "#2563eb",
  service: "#4f46e5",
  screen: "#0891b2",
  data: "#7c3aed",
  decision: "#d97706",
  gotcha: "#dc2626",
};
const COLORS = GRAPH_COLORS;

export function BrainGraph({
  nodes,
  edges,
  selected,
  hrefFor,
}: {
  nodes: GNode[];
  edges: GEdge[];
  selected: string | null;
  hrefFor: (slug: string) => string;
}) {
  const router = useRouter();
  const W = 520, H = 440;
  const [tick, setTick] = useState(0);
  const pos = useRef(new Map<string, { x: number; y: number; vx: number; vy: number }>());
  const [hover, setHover] = useState<string | null>(null);

  const neighborSet = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b);
      m.get(e.b)!.add(e.a);
    }
    return m;
  }, [edges]);

  useEffect(() => {
    // Init on a circle (stable order = stable layout).
    const p = pos.current;
    p.clear();
    nodes.forEach((n, i) => {
      const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
      p.set(n.slug, {
        x: W / 2 + Math.cos(angle) * 150,
        y: H / 2 + Math.sin(angle) * 150,
        vx: 0, vy: 0,
      });
    });
    let frame = 0;
    let raf = 0;
    const step = () => {
      for (let it = 0; it < 4; it++) {
        // repulsion
        for (const a of nodes) {
          const pa = p.get(a.slug)!;
          for (const b of nodes) {
            if (a.slug >= b.slug) continue;
            const pb = p.get(b.slug)!;
            let dx = pa.x - pb.x, dy = pa.y - pb.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = 1; }
            const f = 2600 / d2;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f, fy = (dy / d) * f;
            pa.vx += fx; pa.vy += fy; pb.vx -= fx; pb.vy -= fy;
          }
        }
        // springs
        for (const e of edges) {
          const pa = p.get(e.a), pb = p.get(e.b);
          if (!pa || !pb) continue;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - 110) * 0.02;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          pa.vx += fx; pa.vy += fy; pb.vx -= fx; pb.vy -= fy;
        }
        // gravity + integrate
        for (const n of nodes) {
          const pn = p.get(n.slug)!;
          pn.vx += (W / 2 - pn.x) * 0.005;
          pn.vy += (H / 2 - pn.y) * 0.005;
          pn.vx *= 0.82; pn.vy *= 0.82;
          pn.x = Math.max(24, Math.min(W - 24, pn.x + pn.vx));
          pn.y = Math.max(24, Math.min(H - 24, pn.y + pn.vy));
        }
      }
      setTick((t) => t + 1);
      if (++frame < 60) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges]);

  void tick;
  const p = pos.current;
  const focus = hover ?? selected;
  const focusNeighbors = focus ? (neighborSet.get(focus) ?? new Set()) : null;
  const dim = (slug: string) =>
    focus && slug !== focus && !(focusNeighbors && focusNeighbors.has(slug));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full select-none rounded-lg border border-slate-200 bg-slate-50"
      role="img"
      aria-label="Brain graph"
    >
      {edges.map((e, i) => {
        const pa = p.get(e.a), pb = p.get(e.b);
        if (!pa || !pb) return null;
        const active = focus && (e.a === focus || e.b === focus);
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={active ? "#4f46e5" : "#e2e8f0"}
            strokeWidth={active ? 1.6 : 1}
            opacity={focus && !active ? 0.25 : 1}
          />
        );
      })}
      {nodes.map((n) => {
        const pn = p.get(n.slug);
        if (!pn) return null;
        const r = 5 + Math.min(9, n.degree * 1.4);
        const c = COLORS[n.type] ?? "#94a3b8";
        return (
          <g
            key={n.slug}
            transform={`translate(${pn.x},${pn.y})`}
            opacity={dim(n.slug) ? 0.28 : 1}
            className="cursor-pointer"
            onClick={() => router.push(hrefFor(n.slug))}
            onMouseEnter={() => setHover(n.slug)}
            onMouseLeave={() => setHover(null)}
          >
            {n.slug === selected && (
              <circle r={r + 4} fill="none" stroke="#4f46e5" strokeWidth={1.5} />
            )}
            <circle r={r} fill={c} opacity={0.9} />
            <text
              y={r + 11}
              textAnchor="middle"
              fontSize={9}
              fill={n.slug === focus ? "#0f172a" : "#94a3b8"}
            >
              {n.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
