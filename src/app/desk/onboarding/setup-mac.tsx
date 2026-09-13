"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// One click: the app mints a token this user never sees and installs the
// CLI, plugin and hooks (setup::bootstrap in widget/src-tauri/src/setup.rs).
// Gating on the server reads only the token; this shows the local ✓/✗ list.
export function SetupMac({ done }: { done: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bridge, setBridge] = useState<boolean | null>(null);

  useEffect(() => {
    const c = core();
    setBridge(Boolean(c));
    c?.invoke("setup_state").then((s) => setSetup(s as Setup)).catch(() => {});
  }, []);

  async function run() {
    const c = core();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      await c.invoke("bootstrap", { server: window.location.origin, token: null, remindersList: null, remindersRepo: null });
      setSetup((await c.invoke("setup_state")) as Setup);
      router.refresh();
    } catch (e) {
      setErr(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  if (bridge === false) {
    return <p className="text-[12.5px] text-muted">Open this page inside the DevBrain app to set up this Mac.</p>;
  }
  const failed = setup?.bootstrap_failed ?? [];
  return (
    <div>
      <button type="button" onClick={run} disabled={busy} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
        {busy ? "Setting up…" : done ? "Re-run setup" : "Set up this Mac"}
      </button>
      {setup?.bootstrap_at && (
        <p className="mt-2 text-[12.5px] text-muted">
          {setup.bootstrap_ok === false ? `${failed.join(", ") || "a part"} failed — re-running is safe and only fixes what's missing.` : "All parts installed."}
        </p>
      )}
      {err && <p className="mt-2 text-[12.5px] text-stop">{err}</p>}
    </div>
  );
}
