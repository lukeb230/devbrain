// ============================================================================
// "Has this element been seen yet?" — answered by polling its rect.
//
// Not IntersectionObserver, deliberately. IO is the idiomatic answer and it is
// what this started as, but two mechanisms in a row failed silently here: a
// scroll listener (swallowed by scroll-behavior: smooth) and then IO itself,
// which delivered zero callbacks in the browser this project is verified in.
// A trigger that cannot be tested is a trigger that ships broken.
//
// One 300ms interval per element, cancelled the moment it fires, is cheap
// enough that the reliability is worth more than the elegance.
// ============================================================================

export function onceInView(el: Element, cb: () => void, opts: { margin?: number } = {}): () => void {
  const margin = opts.margin ?? 0;
  let done = false;
  let id = 0;
  const stop = () => {
    if (id) window.clearInterval(id);
    id = 0;
  };
  const check = () => {
    if (done) return;
    const r = el.getBoundingClientRect();
    // Any part of it inside the viewport, allowing a margin to fire early.
    if (r.top < window.innerHeight - margin && r.bottom > 0) {
      done = true;
      stop();
      cb();
    }
  };
  id = window.setInterval(check, 300);
  check();
  return stop;
}
