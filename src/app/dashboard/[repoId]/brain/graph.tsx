"use client";

// Obsidian-style knowledge graph — a LIVE force simulation:
//   - continuous physics loop (springs + charge repulsion + centering) that
//     stays warm and settles smoothly instead of freezing after a fixed run
//   - the WORLD grows with the node count (sqrt scale), so dense graphs get
//     more room instead of squishing into a fixed box
//   - wheel / trackpad zoom (cursor-anchored) + drag-the-background to pan,
//     with +/−/fit buttons; a clean background click still deselects
//   - grab any node and drag it; hover highlights its neighborhood; click
//     (without dragging) selects the note — instant, handled by the parent
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
const MIN_K = 0.5;
const MAX_K = 6;

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
  const pan = useRef<{ px: number; py: number; vx0: number; vy0: number; moved: number } | null>(null);

  // World scales with node count: √(n/14) so 14 nodes = the classic box and
  // 56 nodes = a 2× world. Spacing grows with it.
  const scale = Math.max(1, Math.sqrt(nodes.length / 14));
  const WW = W * scale;
  const HH = H * scale;
  const restLen = 120 * Math.pow(scale, 0.8);
  const nodeBoost = 1 + (scale - 1) * 0.35; // nodes grow a little in big worlds

  // View = zoom/pan state in world coordinates. k=1 shows the whole world.
  const view = useRef({ x: 0, y: 0, k: 1 });
  const clampView = () => {
    const v = view.current;
    v.k = Math.max(MIN_K, Math.min(MAX_K, v.k));
    const vw = WW / v.k;
    const vh = HH / v.k;
    const pad = WW * 0.25; // allow some over-pan, never lose the graph
    v.x = Math.max(-pad, Math.min(WW + pad - vw, v.x));
    v.y = Math.max(-pad, Math.min(HH + pad - vh, v.y));
  };

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
          x: WW / 2 + Math.cos(angle) * (WW * 0.22 + (i % 3) * 30),
          y: HH / 2 + Math.sin(angle) * (HH * 0.22 + (i % 2) * 25),
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
    const repulsion = 3200 * scale * 1.4; // more elbow room, scaled to world
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
            const rep = (repulsion / d2) * a;
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
          const f = (d - restLen) * 0.025 * a;
          const fx = (dx / d) * f, fy = (dy / d) * f;
          pa.vx += fx; pa.vy += fy;
          pb.vx -= fx; pb.vy -= fy;
        }
        // Gentle centering + integration.
        for (const n of nodes) {
          const b = p.get(n.slug);
          if (!b) continue;
          if (b.fixed) { b.vx = 0; b.vy = 0; continue; }
          b.vx += (WW / 2 - b.x) * 0.004 * a;
          b.vy += (HH / 2 - b.y) * 0.004 * a;
          b.vx *= 0.86; b.vy *= 0.86;
          b.x = Math.max(20, Math.min(WW - 20, b.x + b.vx));
          b.y = Math.max(20, Math.min(HH - 20, b.y + b.vy));
        }
        alpha.current = Math.max(0.002, a * 0.985);
        setTick((t) => t + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, scale]);

  // Wheel zoom — must be a non-passive listener to preventDefault scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = svg.getBoundingClientRect();
      const v = view.current;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const k2 = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
      if (k2 === v.k) return;
      // Keep the world point under the cursor stationary.
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const wx = v.x + fx * (WW / v.k);
      const wy = v.y + fy * (HH / v.k);
      v.k = k2;
      v.x = wx - fx * (WW / v.k);
      v.y = wy - fy * (HH / v.k);
      clampView();
      setTick((t) => t + 1);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [WW, HH]);

  const zoomBy = (factor: number) => {
    const v = view.current;
    const cx = v.x + WW / v.k / 2;
    const cy = v.y + HH / v.k / 2;
    v.k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
    v.x = cx - WW / v.k / 2;
    v.y = cy - HH / v.k / 2;
    clampView();
    setTick((t) => t + 1);
  };
  const zoomFit = () => {
    view.current = { x: 0, y: 0, k: 1 };
    setTick((t) => t + 1);
  };

  // Pointer → simulation (world) coordinates, honoring the current view.
  const toSim = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const v = view.current;
    return {
      x: v.x + ((e.clientX - r.left) / r.width) * (WW / v.k),
      y: v.y + ((e.clientY - r.top) / r.height) * (HH / v.k),
    };
  };

  const onPointerDown = (slug: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation(); // don't start a background pan
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    const { x, y } = toSim(e);
    drag.current = { slug, moved: 0, px: x, py: y };
    const b = bodies.current.get(slug);
    if (b) b.fixed = true;
    alpha.current = Math.max(alpha.current, 0.6);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (d) {
      const { x, y } = toSim(e);
      d.moved += Math.hypot(x - d.px, y - d.py);
      d.px = x; d.py = y;
      const b = bodies.current.get(d.slug);
      if (b) {
        b.x = Math.max(20, Math.min(WW - 20, x));
        b.y = Math.max(20, Math.min(HH - 20, y));
        b.vx = 0; b.vy = 0;
      }
      alpha.current = Math.max(alpha.current, 0.5);
      setTick((t) => t + 1);
      return;
    }
    const pn = pan.current;
    if (pn) {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const v = view.current;
      const dx = ((e.clientX - pn.px) / r.width) * (WW / v.k);
      const dy = ((e.clientY - pn.py) / r.height) * (HH / v.k);
      pn.moved += Math.abs(e.clientX - pn.px) + Math.abs(e.clientY - pn.py);
      v.x = pn.vx0 - dx;
      v.y = pn.vy0 - dy;
      clampView();
      // vx0/vy0 stay anchored to the drag start; recompute against origin.
      setTick((t) => t + 1);
    }
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

  // Background: drag pans; a clean click (no movement) deselects.
  const onBgPointerDown = (e: React.PointerEvent) => {
    if (drag.current) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    pan.current = { px: e.clientX, py: e.clientY, vx0: view.current.x, vy0: view.current.y, moved: 0 };
  };
  const onBgPointerUp = (e: React.PointerEvent) => {
    const pn = pan.current;
    pan.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch { /* not captured */ }
    if (pn && pn.moved < 5) onSelect(null);
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
  const v = view.current;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${v.x} ${v.y} ${WW / v.k} ${HH / v.k}`}
        className="h-auto w-full touch-none select-none rounded-lg border border-slate-200 bg-slate-50"
        style={{ aspectRatio: `${W} / ${H}`, cursor: pan.current ? "grabbing" : "default" }}
        role="img"
        aria-label="Brain graph — drag nodes, drag background to pan, scroll to zoom, click to open a note"
        onPointerMove={onPointerMove}
        onPointerDown={onBgPointerDown}
        onPointerUp={onBgPointerUp}
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
              strokeWidth={(hovered ? 2 : owned ? 1.8 : 1.1) * Math.sqrt(scale)}
              opacity={focus && !hovered ? 0.3 : 1}
            />
          );
        })}
        {nodes.map((n) => {
          const b = p.get(n.slug);
          if (!b) return null;
          const isHover = hover === n.slug;
          const r = (5 + Math.min(9, n.degree * 1.4)) * nodeBoost * (isHover ? 1.25 : 1);
          const c = GRAPH_COLORS[n.type] ?? "#94a3b8";
          const fontSize = 9.5 * Math.sqrt(scale);
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
                y={r + fontSize + 3}
                textAnchor="middle"
                fontSize={fontSize}
                fill={n.slug === focus ? "#0f172a" : "#8b96a5"}
                style={{ pointerEvents: "none", fontWeight: n.slug === focus ? 600 : 400 }}
              >
                {n.title}
              </text>
            </g>
          );
        })}
      </svg>
      {/* Zoom controls */}
      <div className="absolute right-2 top-2 flex flex-col gap-1">
        {[
          { label: "+", title: "Zoom in", fn: () => zoomBy(1.3) },
          { label: "−", title: "Zoom out", fn: () => zoomBy(1 / 1.3) },
          { label: "⊡", title: "Fit whole graph", fn: zoomFit },
        ].map((btn) => (
          <button
            key={btn.title}
            onClick={btn.fn}
            title={btn.title}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-200 bg-white text-sm leading-none text-slate-500 shadow-sm hover:border-brand-400 hover:text-brand-600"
          >
            {btn.label}
          </button>
        ))}
      </div>
    </div>
  );
}
