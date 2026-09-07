// ============================================================================
// Which site paths may load inside the desktop panel, and how to validate a
// post-login destination. The Rust shell keeps the SAME list in
// widget/src-tauri/src/main.rs (on_navigation) — change both together, or
// the panel bounces between the two guards forever.
// ============================================================================

export function panelAllowed(path: string): boolean {
  return path === "/" || /^\/(widget|auth|welcome|join\/)/.test(path);
}

/** Which site paths may load inside the Desk window (the Rust shell keeps the
 *  same list for the "desk" window). Everything else opens in the browser. */
export function deskAllowed(path: string): boolean {
  return path === "/" || /^\/(desk|auth|welcome|join\/|api\/)/.test(path);
}

/** Same-origin path or the fallback. Rejects protocol-relative `//host`. */
export function safeNext(raw: string | null | undefined, fallback: string): string {
  const s = String(raw ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : fallback;
}
