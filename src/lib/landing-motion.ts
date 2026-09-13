// ============================================================================
// Motion for the landing page, without a library. Everything is server-
// rendered in its final state; a class added before first paint (lp-js) lets
// CSS hold elements at their start pose, and a one-shot IntersectionObserver
// releases them. Only opacity and transform ever change. This file is the
// pure part: the counting curve and the constants the CSS mirrors.
// ============================================================================

/** The enter curve, the same one .lp-interrupt uses. */
export const EASE_OUT = "cubic-bezier(.16,1,.3,1)";

/** Value of a counter at progress t in [0,1], eased out, whole numbers. */
export function countAt(t: number, target: number): number {
  const p = Math.min(1, Math.max(0, t));
  const eased = 1 - Math.pow(1 - p, 3);
  return Math.round(eased * target);
}
