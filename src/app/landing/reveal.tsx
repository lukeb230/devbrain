"use client";

import { createElement, useEffect, useRef, useState, type ReactNode } from "react";
import { countAt } from "@/lib/landing-motion";

// ============================================================================
// Play-once reveals. <Reveal> renders its children in the final state (the
// server never hides anything); after mount a one-shot IntersectionObserver
// sets data-in and the CSS in globals.css (html.lp-js .lp-fx) animates from
// the start pose. <Count> is the same idea for a numeral. A 2.5s safety timer
// runs alongside the observer so the page is never left unrevealed if the
// observer stays silent (see in-view.ts for why that happens here).
// ============================================================================

export type Fx = "up" | "left" | "right" | "scale" | "panel" | "cursor-l" | "cursor-r" | "file" | "tab" | "fade";

/** Adds lp-js to <html> before first paint; without it none of the motion CSS applies. */
export function MotionGate() {
  return <script dangerouslySetInnerHTML={{ __html: `document.documentElement.classList.add("lp-js")` }} />;
}

function useOnce(ref: React.RefObject<Element | null>, amount: number) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (!("IntersectionObserver" in window)) { setSeen(true); return; }
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); window.clearTimeout(t); } },
      { threshold: amount, rootMargin: "-10% 0px -10% 0px" },
    );
    io.observe(el);
    const t = window.setTimeout(() => { setSeen(true); io.disconnect(); }, 2500);
    return () => { io.disconnect(); window.clearTimeout(t); };
  }, [ref, amount, seen]);
  return seen;
}

export function Reveal({ as = "div", fx = "up", delay = 0, duration = 600, y, amount = 0.2, className = "", children, ...rest }: {
  as?: keyof React.JSX.IntrinsicElements;
  fx?: Fx;
  delay?: number;
  duration?: number;
  /** Start offset for fx="up", in px. */
  y?: number;
  amount?: number;
  className?: string;
  children?: ReactNode;
  [k: string]: unknown;
}) {
  const ref = useRef<Element | null>(null);
  const seen = useOnce(ref, amount);
  const style = { "--fx-delay": `${delay}ms`, "--fx-d": `${duration}ms`, ...(y !== undefined ? { "--fx-y": `${y}px` } : {}) } as React.CSSProperties;
  return createElement(as, { ref, className: `lp-fx ${className}`, "data-fx": fx, ...(seen ? { "data-in": "" } : {}), style, ...rest }, children);
}

/** Hero elements animate on arrival, not on scroll. */
export function Mount({ as = "div", delay = 0, duration = 600, y, className = "", children, ...rest }: {
  as?: keyof React.JSX.IntrinsicElements; delay?: number; duration?: number; y?: number; className?: string; children?: ReactNode; [k: string]: unknown;
}) {
  const style = { "--fx-delay": `${delay}ms`, "--fx-d": `${duration}ms`, ...(y !== undefined ? { "--fx-y": `${y}px` } : {}) } as React.CSSProperties;
  return createElement(as, { className: `lp-mount ${className}`, style, ...rest }, children);
}

/** A numeral that counts up once, from 0 to `to`, after `delay` ms in view. Server renders `to`. */
export function Count({ to, delay = 0, duration = 900, className = "" }: { to: number; delay?: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useOnce(ref, 0.5);
  const [v, setV] = useState(to);
  useEffect(() => {
    if (!seen || to === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const start = performance.now() + delay;
    setV(0);
    const tick = (now: number) => {
      const t = (now - start) / duration;
      setV(countAt(t, to));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const safety = window.setTimeout(() => { cancelAnimationFrame(raf); setV(to); }, delay + duration + 500);
    return () => { cancelAnimationFrame(raf); window.clearTimeout(safety); };
  }, [seen, to, delay, duration]);
  return <span ref={ref} className={`tabular-nums ${className}`}>{v}</span>;
}
