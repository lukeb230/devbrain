"use client";

// Appearance: "light" (the default when nothing is stored) | "system" |
// "dark". Stored per Mac in localStorage, applied as html[data-wg-theme];
// light is the .wg base, dark applies for "dark" or for "system" when macOS
// is dark (see globals.css). Every shell runs a tiny inline script before
// paint so there's no flash. Shared by the panel, the Desk and the browser.

import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "devbrain_theme";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "system" || v === "dark" ? v : "light";
  } catch { return "light"; }
}

export function applyThemePref(pref: ThemePref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode */ }
  applyThemeToDocument(pref);
}

/** Apply without writing — used when ANOTHER window (the Desk) changed the key. */
export function applyThemeToDocument(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "light") delete root.dataset.wgTheme; else root.dataset.wgTheme = pref;
  window.dispatchEvent(new Event("devbrain-theme"));
}

/** The theme actually in effect ("light" | "dark"), tracking both the pref and the OS. */
export function useResolvedTheme(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">("light");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const compute = () => {
      const pref = readThemePref();
      setT(pref === "system" ? (mq.matches ? "dark" : "light") : pref);
    };
    compute();
    mq.addEventListener("change", compute);
    window.addEventListener("devbrain-theme", compute);
    const onStorage = (e: StorageEvent) => { if (e.key === THEME_KEY) { applyThemeToDocument(readThemePref()); compute(); } };
    window.addEventListener("storage", onStorage);
    return () => { mq.removeEventListener("change", compute); window.removeEventListener("devbrain-theme", compute); window.removeEventListener("storage", onStorage); };
  }, []);
  return t;
}
