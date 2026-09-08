"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DEFAULT_PREFS, NOTIF_ROWS, PREFS_EVENT, readPrefs, writePrefs, type BoolPref, type NotifPrefs } from "@/app/widget/notifier";
import { applyThemePref, readThemePref, type ThemePref } from "@/app/widget/theme";
import { Switch } from "../ui";

// ============================================================================
// This Mac (Dusk) — the preferences page. Left: Notifications (master switch,
// scope, one switch per event kind) — the same localStorage prefs the panel's
// notifier reads, so a flip here is live in the panel immediately. Right:
// App — Appearance (shared theme key), Dock / login / Reminders sync over IPC
// (mac_prefs / set_mac_pref), Check for updates (run_update), Setup on this
// Mac (setup_state + bootstrap). In a plain browser the IPC rows say so.
// Never calls open_desk (see ipc-probe.tsx for why).
// ============================================================================

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Prefs = { dock: boolean; autostart: boolean; reminders: boolean; app_version: string; channel: string };
type Setup = { app_version?: string; bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const APP_ROWS: { key: "dock" | "autostart" | "reminders"; title: string; sub: string }[] = [
  { key: "dock", title: "Show in Dock", sub: "Off by default — the menu-bar brain is home. While the Console is open the app shows a Dock icon anyway, then returns to menu-bar-only when you close it." },
  { key: "autostart", title: "Launch at login", sub: "Keeps presence, notifications and Reminders sync running." },
  { key: "reminders", title: "Reminders sync", sub: "Every 3 minutes, items on the lists mapped under Reminders become tasks. Needs the Reminders permission the app asked for at setup." },
];

function SectionHead({ title, right }: { title: string; right: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
      <h3 className="m-0 font-display text-[14px] font-semibold text-txt">{title}</h3>
      <span className="ml-auto font-mono text-[10px] uppercase tracking-[.12em] text-faint">{right}</span>
    </div>
  );
}
function PrefRow({ title, sub, right, first }: { title: string; sub?: ReactNode; right: ReactNode; first?: boolean }) {
  return (
    <div className={`flex items-center gap-3 py-[11px] ${first ? "" : "border-t border-line"}`}>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] text-txt">{title}</div>
        {sub && <div className="mt-0.5 text-[12px] leading-[1.55] text-muted">{sub}</div>}
      </div>
      {right}
    </div>
  );
}
function Seg<T extends string>({ options, value, onPick }: { options: { key: T; label: string }[]; value: T; onPick: (k: T) => void }) {
  return (
    <span className="inline-flex rounded-lg border border-line2 p-0.5">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onPick(o.key)} className={`rounded-md px-2.5 py-[3px] font-display text-[11px] font-semibold ${o.key === value ? "bg-row2 text-txt" : "text-muted hover:text-txt"}`}>{o.label}</button>
      ))}
    </span>
  );
}

export function NotificationSettings({ testForm }: { testForm?: ReactNode }) {
  const [prefs, setPrefs] = useState<NotifPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    setPrefs(readPrefs());
    const sync = () => setPrefs(readPrefs());
    window.addEventListener(PREFS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => { window.removeEventListener(PREFS_EVENT, sync); window.removeEventListener("storage", sync); };
  }, []);
  const set = (patch: Partial<NotifPrefs>) => { const next = { ...prefs, ...patch }; setPrefs(next); writePrefs(next); };
  const flip = (k: BoolPref) => set({ [k]: !prefs[k] } as Partial<NotifPrefs>);
  return (
    <section>
      <SectionHead title="Notifications" right={<>scope · <Seg options={[{ key: "all", label: "All repos" }, { key: "repo", label: "This repo" }]} value={prefs.scope} onPick={(k) => set({ scope: k })} /></>} />
      <PrefRow first title="Notifications on this Mac" right={<button type="button" onClick={() => flip("enabled")}><Switch on={prefs.enabled} /></button>} />
      {NOTIF_ROWS.map((r) => (
        <PrefRow key={r.key} title={r.label} sub={r.detail} right={<button type="button" onClick={() => flip(r.key)}><Switch on={prefs[r.key]} disabled={!prefs.enabled} /></button>} />
      ))}
      <p className="mt-2.5 text-[12px] text-faint">Pause for an hour or until tomorrow from the panel&apos;s gear menu. {testForm}</p>
    </section>
  );
}

export function AppSettings() {
  const [core, setCore] = useState<Core | null | undefined>(undefined);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [theme, setTheme] = useState<ThemePref>("light");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    setTheme(readThemePref());
    const c = (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;
    setCore(c);
    if (!c) return;
    c.invoke("mac_prefs").then((p) => setPrefs(p as Prefs)).catch((e) => setErr(`This app build has no preference bridge yet (${String(e).slice(0, 80)}). Update the app, or use the tray menu.`));
    c.invoke("setup_state").then((s) => setSetup(s as Setup)).catch(() => {});
  }, []);

  const flip = async (key: "dock" | "autostart" | "reminders", on: boolean) => {
    if (!core) return;
    setBusy(key); setErr(null);
    try { setPrefs((await core.invoke("set_mac_pref", { key, on })) as Prefs); } catch (e) { setErr(String(e).slice(0, 160)); } finally { setBusy(null); }
  };
  const rerun = async () => {
    if (!core) return;
    setBusy("setup"); setErr(null);
    try {
      await core.invoke("bootstrap", { server: window.location.origin, token: null, remindersList: null, remindersRepo: null });
      setSetup((await core.invoke("setup_state")) as Setup);
    } catch (e) { setErr(String(e).slice(0, 160)); } finally { setBusy(null); }
  };
  const inApp = core !== null && core !== undefined;
  const setupLine = setup?.bootstrap_at
    ? `ran ${new Date(setup.bootstrap_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} · ${setup.bootstrap_ok === false ? `${(setup.bootstrap_failed ?? []).join(", ") || "a part"} failed` : "all parts ok"}. Re-running is safe: it keeps your token and only fixes what’s missing.`
    : "Not run yet on this Mac. Re-running is safe: it keeps your token and only fixes what’s missing.";

  return (
    <section>
      <SectionHead title="App" right="this Mac only" />
      <PrefRow first title="Appearance" sub="The Console follows the panel." right={<Seg options={[{ key: "light", label: "Light" }, { key: "system", label: "System" }, { key: "dark", label: "Dark" }]} value={theme} onPick={(k) => { setTheme(k); applyThemePref(k); }} />} />
      {core === null && <p className="border-t border-line py-[11px] text-[12px] leading-[1.55] text-muted">You&apos;re reading this in a browser. Dock, login, Reminders sync and updates are switches in the DevBrain app: open this page in the Console, or use the app&apos;s tray menu.</p>}
      {inApp && APP_ROWS.map((r) => (
        <PrefRow key={r.key} title={r.title} sub={r.sub} right={<button type="button" disabled={!prefs || busy !== null} onClick={() => prefs && flip(r.key, !prefs[r.key])} title={prefs ? (prefs[r.key] ? "On — click to turn off" : "Off — click to turn on") : "Reading…"}><Switch on={Boolean(prefs?.[r.key])} disabled={!prefs} /></button>} />
      ))}
      {inApp && (
        <>
          <PrefRow title="Check for updates" sub={<>Runs devbrain update: CLI, plugin, jobs and the app bundle. A new build starts on the next launch.{prefs ? ` This is ${prefs.channel} ${prefs.app_version}.` : ""}</>} right={<button type="button" onClick={() => core!.invoke("run_update").catch((e) => setErr(String(e).slice(0, 160)))} className="whitespace-nowrap rounded-lg border border-line2 px-[11px] py-1.5 font-display text-[11.5px] font-semibold text-txt hover:border-line3">Check now</button>} />
          <PrefRow title="Setup on this Mac" sub={setupLine} right={<button type="button" disabled={busy === "setup"} onClick={rerun} className="font-display text-[11.5px] font-semibold text-accent hover:underline disabled:opacity-50">{busy === "setup" ? "Running…" : "Re-run"}</button>} />
        </>
      )}
      {err && <p className="mt-2 text-[12px] text-wait">{err}</p>}
    </section>
  );
}
