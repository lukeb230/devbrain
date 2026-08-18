"use client";

// Obsidian-style knowledge graph — a LIVE force simulation:
//   - continuous physics loop (springs + charge repulsion + centering) that
//     stays warm and settles smoothly instead of freezing after a fixed run
//   - grab any node and drag it; the network flows around it and relaxes
//     when released
//   - hover highlights a node's neighborhood; click (without dragging)
//     selects the note — selection is handled by the parent, client-side,
//     so switching notes is instant
// Zero dependencies.

import { useEffect, useRef, useState } from "react";
import { GRAPH_COLORS } from "./colors";

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

type Body = { x: number; y: number; vx: number; vy: number; fixed: boolean };

const W = 640;
const H = 500;

export function BrainGraph({
  nodes,
  edges,
  selected,
  onSelect,
}: {
  nodes: GNode[];
  edges: GEdge[];
  selected: string | null;
  onSelect: (slug: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bodies = useRef(new Map<string, Body>());
  const alpha = useRef(1); // simulation temperature; decays, reheats on touch
  const [, setTick] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ slug: string; moved: number; px: number; py: number } | null>(null);

  // Neighbor lookup for hover highlighting.
  const neighbors = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    const m = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!m.has(e.a)) m.set(e.a, new Set());
      if (!m.has(e.b)) m.set(e.b, new Set());
      m.get(e.a)!.add(e.b);
      m.get(e.b)!.add(e.a);
    }
    neighbors.current = m;
  }, [edges]);

  // Init positions once per node-set (preserve existing bodies so selecting
  // a note never resets the layout).
  const signature = nodes.map((n) => n.slug).sort().join("|");
  useEffect(() => {
    const p = bodies.current;
    const known = new Set(nodes.map((n) => n.slug));
    for (const slug of [...p.keys()]) if (!known.has(slug)) p.delete(slug);
    nodes.forEach((n, i) => {
      if (!p.has(n.slug)) {
        const angle = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        p.set(n.slug, {
          x: W / 2 + Math.cos(angle) * (120 + (i % 3) * 30),
          y: H / 2 + Math.sin(angle) * (110 + (i % 2) * 25),
          vx: 0,
          vy: 0,
          fixed: false,
        });
      }
    });
    alpha.current = 1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // The physics loop — runs continuously, cools down when idle, reheats on
  // any interaction. Cheap at this scale (O(n²) with n ≈ dozens).
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const p = bodies.current;
      const a = alpha.current;
      if (a > 0.003) {
        // Charge repulsion.
        const arr = nodes;
        for (let i = 0; i < arr.length; i++) {
          const pa = p.get(arr[i].slug);
          if (!pa) continue;
          for (let j = i + 1; j < arr.length; j++) {
            const pb = p.get(arr[j].slug);
            if (!pb) continue;
            let dx = pa.x - pb.x, dy = pa.y - pb.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) { d2 = 1; dx = (Math.sin(i * 7 + j) || 0.5); dy = 0.5; }
            const d = Math.sqrt(d2);
            const rep = (3200 / d2) * a;
            const fx = (dx / d) * rep, fy = (dy / d) * rep;
            pa.vx += fx; pa.vy += fy;
            pb.vx -= fx; pb.vy -= fy;
          }
        }
        // Springs along edges.
        for (const e of edges) {
          const pa = p.get(e.a), pb = p.get(e.b);
          if (!pa || !pb) continue;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          const f = (d - 120) * 0.025 * a;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          pa.vx += fx; pa.vy += fy;
          pb.vx -= fx; pb.vy -= fy;
        }
        // Gentle centering + integration.
        for (const n of nodes) {
          const b = p.get(n.slug);
          if (!b) continue;
          if (b.fixed) { b.vx = 0; b.vy = 0; continue; }
          b.vx += (W / 2 - b.x) * 0.004 * a;
          b.vy += (H / 2 - b.y) * 0.004 * a;
          b.vx *= 0.86; b.vy *= 0.86;
          b.x = Math.max(20, Math.min(W - 20, b.x + b.vx));
          b.y = Math.max(20, Math.min(H - 20, b.y + b.vy));
        }
        alpha.current = Math.max(0.002, a * 0.985);
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [nodes, edges]);

  // Pointer → simulation coordinates.
  const toSim = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * W,
      y: ((e.clientY - r.top) / r.height) * H,
    };
  };

  const onPointerDown = (slug: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const { x, y } = toSim(e);
    drag.current = { slug, moved: 0, px: x, py: y };
    const b = bodies.current.get(slug);
    if (b) b.fixed = true;
    alpha.current = Math.max(alpha.current, 0.6);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const { x, y } = toSim(e);
    d.moved += Math.hypot(x - d.px, y - d.py);
    d.px = x; d.py = y;
    const b = bodies.current.get(d.slug);
    if (b) {
      b.x = Math.max(20, Math.min(W - 20, x));
      b.y = Math.max(20, Math.min(H - 20, y));
      b.vx = 0; b.vy = 0;
    }
    alpha.current = Math.max(alpha.current, 0.5);
    setTick((t) => t + 1);
  };

  const onPointerUp = (slug: string) => (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    const b = bodies.current.get(slug);
    if (b) b.fixed = false;
    alpha.current = Math.max(alpha.current, 0.4);
    (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    // A press that barely moved is a click → select the note (instant).
    if (d && d.moved < 5) onSelect(slug);
  };

  // Hover dims everything outside the hovered neighborhood; the SELECTED
  // node permanently lights up its connection lines and rings its neighbors,
  // so you always see visually what the open note links to.
  const focus = hover;
  const focusNeighbors = focus ? (neighbors.current.get(focus) ?? new Set()) : null;
  const dim = (slug: string) =>
    focus && slug !== focus && !(focusNeighbors && focusNeighbors.has(slug));
  const selNeighbors = selected ? (neighbors.current.get(selected) ?? new Set()) : new Set();

  const p = bodies.current;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full touch-none select-none rounded-lg border border-slate-200 bg-slate-50"
      role="img"
      aria-label="Brain graph — drag nodes, click to open a note"
      onPointerMove={onPointerMove}
      onClick={() => onSelect(null)} // background click = deselect (nodes stopPropagation)
    >
      {edges.map((e, i) => {
        const pa = p.get(e.a), pb = p.get(e.b);
        if (!pa || !pb) return null;
        const hovered = focus && (e.a === focus || e.b === focus);
        const owned = selected && (e.a === selected || e.b === selected);
        return (
          <line
            key={i}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            stroke={hovered || owned ? "#4f46e5" : "#dbe1ea"}
            strokeWidth={hovered ? 2 : owned ? 1.8 : 1.1}
            opacity={focus && !hovered ? 0.3 : 1}
          />
        );
      })}
      {nodes.map((n) => {
        const b = p.get(n.slug);
        if (!b) return null;
        const isHover = hover === n.slug;
        const r = (5 + Math.min(9, n.degree * 1.4)) * (isHover ? 1.25 : 1);
        const c = GRAPH_COLORS[n.type] ?? "#94a3b8";
        return (
          <g
            key={n.slug}
            transform={`translate(${b.x},${b.y})`}
            opacity={dim(n.slug) ? 0.25 : 1}
            style={{ cursor: "grab" }}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={onPointerDown(n.slug)}
            onPointerUp={onPointerUp(n.slug)}
            onMouseEnter={() => { setHover(n.slug); alpha.current = Math.max(alpha.current, 0.05); }}
            onMouseLeave={() => setHover(null)}
          >
            {n.slug === selected && (
              <circle r={r + 5} fill="none" stroke="#4f46e5" strokeWidth={1.6} />
            )}
            {n.slug !== selected && selNeighbors.has(n.slug) && (
              <circle r={r + 4} fill="none" stroke="#4f46e5" strokeWidth={1} opacity={0.45} />
            )}
            {/* generous invisible hit area so grabbing feels easy */}
            <circle r={Math.max(14, r + 6)} fill="transparent" />
            <circle r={r} fill={c} opacity={0.92} />
            <text
              y={r + 12}
              textAnchor="middle"
              fontSize={9.5}
              fill={n.slug === focus ? "#0f172a" : "#8b96a5"}
              style={{ pointerEvents: "none", fontWeight: n.slug === focus ? 600 : 400 }}
            >
              {n.title}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
