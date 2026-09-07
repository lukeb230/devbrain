"use client";

import { useEffect, useState } from "react";

// This Mac → "App bridge": is the page running inside the DevBrain app, and
// can it reach the app's commands? Answers the question every "why did that
// open in the browser" report starts with. Stays useful after phase 4.
type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };

export function IpcProbe() {
  const [state, setState] = useState<{ bridge: boolean; setup: string; openDesk: string }>({ bridge: false, setup: "…", openDesk: "…" });
  useEffect(() => {
    const core = (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core;
    if (!core) {
      setState({ bridge: false, setup: "n/a", openDesk: "n/a" });
      return;
    }
    (async () => {
      let setup = "ok";
      let openDesk = "ok";
      try {
        const s = (await core.invoke("setup_state")) as { app_version?: string };
        setup = `ok · app ${s?.app_version ?? "?"}`;
      } catch (e) {
        setup = `error: ${String(e).slice(0, 120)}`;
      }
      try {
        // Same command the panel's "Open the Desk →" uses. Calling it from the
        // Desk just re-focuses this window — a harmless round trip.
        await core.invoke("open_desk", { route: "/mac" });
      } catch (e) {
        openDesk = `error: ${String(e).slice(0, 120)}`;
      }
      setState({ bridge: true, setup, openDesk });
    })();
  }, []);
  return (
    <div className="mt-3 rounded-xl border border-line bg-row px-4 py-3">
      <div className="font-display text-[10px] uppercase tracking-[.14em] text-muted">App bridge</div>
      <div className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-[11.5px]">
        <span className="text-faint">window.__TAURI__</span><span>{state.bridge ? "present" : "absent (plain browser?)"}</span>
        <span className="text-faint">setup_state</span><span>{state.setup}</span>
        <span className="text-faint">open_desk</span><span>{state.openDesk}</span>
      </div>
    </div>
  );
}
