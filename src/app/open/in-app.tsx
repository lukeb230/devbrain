"use client";
import { useEffect } from "react";

// /open is a browser page. If it ever renders inside the app's own webview
// (a sign-in or join flow that finished in the Desk window), skip the
// "open in app" pitch and go straight to the Desk route.
export function InAppRedirect({ to }: { to: string }) {
  useEffect(() => {
    const w = window as unknown as { __TAURI_INTERNALS__?: unknown };
    if (w.__TAURI_INTERNALS__) window.location.replace(to);
  }, [to]);
  return null;
}
