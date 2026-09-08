"use client";
import { useEffect } from "react";
import { applyThemeToDocument, readThemePref, THEME_KEY } from "@/app/widget/theme";

// The Desk follows the panel: when the other window writes the theme key,
// apply it here without a reload.
export function ThemeFollow() {
  useEffect(() => {
    const on = (e: StorageEvent) => { if (e.key === THEME_KEY) applyThemeToDocument(readThemePref()); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  return null;
}
