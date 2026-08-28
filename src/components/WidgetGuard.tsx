"use client";

// Self-healing route guard for the desktop widget shell.
//
// The Tauri panel locks real navigations to /widget + auth, but Next.js
// client-side transitions (pushState) are invisible to that lock — so a
// session hiccup can land the panel on "/" and from there SPA links walk
// straight into the full dashboard with no way back. This guard runs on
// every route change: inside the shell (window.__TAURI__ present), any
// path outside the widget/auth surface bounces back to /widget instantly.
//
// /welcome and /join/* are allowed too: a signed-in user with no team
// creates or joins one right inside the panel. The list lives in
// src/lib/panel-routes.ts and is mirrored by widget/src-tauri/src/main.rs.
//
// "/" stays allowed — it's the sign-in page the widget itself redirects to
// when signed out (bouncing it would loop). In a normal browser this
// component does nothing at all.

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { panelAllowed } from "@/lib/panel-routes";

export function WidgetGuard() {
  const pathname = usePathname();
  useEffect(() => {
    const isShell = typeof window !== "undefined" && "__TAURI__" in window;
    if (isShell && pathname && !panelAllowed(pathname)) {
      window.location.replace("/widget");
    }
  }, [pathname]);
  return null;
}
