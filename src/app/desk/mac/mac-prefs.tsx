"use client";

import { useEffect, useState } from "react";

// This Mac → "App": the Mac-side preferences, read from and written to the
// app over IPC (mac_prefs / set_mac_pref / run_update). In a plain browser
// there is no bridge and the card says where the switches live instead.
// Never calls open_desk (see ipc-probe.tsx for why).
type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Prefs = { dock: boolean; autostart: boolean; reminders: boolean; app_version: string; channel: string };

const SWITCHES: { key: keyof Prefs & ("dock" | "autostart" | "reminders"); title: string; sub: string }[] = [
  { key: "dock", title: "Show in Dock", sub: "Off by default — the menu-bar brain is home. While the Desk is open the app shows a Dock icon anyway, then returns to menu-bar-only when you close it." },
  { key: "autostart", title: "Launch at login", sub: "Keeps presence, notifications and Reminders sync running." },
  { key: "reminders", title: "Reminders sync", sub: "Every 3 minutes, items on the lists mapped under Reminders become tasks. Needs the Reminders permission the app asked for at setup." },
];

export function MacPrefs() {
  const [core, setCore] = useState<Core | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const c = (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;
    setCore(c);
    if (!c) return;
    c.invoke("mac_prefs").then((p) => setPrefs(p as Prefs)).catch((e) => setErr(`This app build has no preference bridge yet (${String(e).slice(0, 80)}). Update the app, or use the tray menu.`));
  }, []);

  const flip = async (key: "dock" | "autostart" | "reminders", on: boolean) => {
    if (!core) return;
    setBusy(key);
    setErr(null);
    try {
      setPrefs((await core.invoke("set_mac_pref", { key, on })) as Prefs);
    } catch (e) {
      setErr(String(e).slice(0, 160));
    } finally {
      setBusy(null);
    }
  };

  if (core === undefined) return null;
  if (core === null) {
    return <p className="text-[12px] text-muted">You&apos;re reading this in a browser. The switches for Dock, login and Reminders sync are in the DevBrain app: open this page in the Desk, or use the app&apos;s tray menu.</p>;
  }
  return (
    <>
      {SWITCHES.map((s) => (
        <div key={s.key} className="flex items-center gap-3 border-t border-line py-2 first:border-t-0">
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-txt">{s.title}</div>
            <div className="text-[11px] text-muted">{s.sub}</div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={Boolean(prefs?.[s.key])}
            disabled={!prefs || busy !== null}
            onClick={() => prefs && flip(s.key, !prefs[s.key])}
            className={"relative h-5 w-9 flex-shrink-0 rounded-full transition disabled:opacity-50 " + (prefs?.[s.key] ? "bg-brand-500" : "bg-line2")}
            title={prefs ? (prefs[s.key] ? "On — click to turn off" : "Off — click to turn on") : "Reading…"}
          >
            <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white transition " + (prefs?.[s.key] ? "left-[18px]" : "left-0.5")} />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3 border-t border-line py-2">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-txt">Check for updates</div>
          <div className="text-[11px] text-muted">Runs devbrain update: CLI, plugin, jobs and the app bundle. A new build starts on the next launch.{prefs ? ` This is ${prefs.channel} ${prefs.app_version}.` : ""}</div>
        </div>
        <button type="button" onClick={() => core.invoke("run_update").catch((e) => setErr(String(e).slice(0, 160)))} className="rounded-lg border border-line2 px-3 py-1.5 font-display text-[11.5px] font-semibold text-muted hover:border-muted hover:text-txt">Check now</button>
      </div>
      {err && <p className="mt-1 text-[11.5px] text-wait">{err}</p>}
    </>
  );
}
