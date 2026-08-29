"use client";

// Panel appearance: "system" (default) | "light" | "dark". Stored per Mac in
// localStorage, applied as html[data-wg-theme]; "system" removes the
// attribute so prefers-color-scheme decides (see .wg in globals.css). The
// widget layout runs a tiny inline script before paint so there's no flash.

import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
export const THEME_KEY = "devbrain_theme";

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch { return "system"; }
}

export function applyThemePref(pref: ThemePref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode */ }
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.wgTheme; else root.dataset.wgTheme = pref;
  window.dispatchEvent(new Event("devbrain-theme"));
}

/** The theme actually in effect ("light" | "dark"), tracking both the pref and the OS. */
export function useResolvedTheme(): "light" | "dark" {
  const [t, setT] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const compute = () => {
      const pref = readThemePref();
      setT(pref === "system" ? (mq.matches ? "light" : "dark") : pref);
    };
    compute();
    mq.addEventListener("change", compute);
    window.addEventListener("devbrain-theme", compute);
    return () => { mq.removeEventListener("change", compute); window.removeEventListener("devbrain-theme", compute); };
  }, []);
  return t;
}
