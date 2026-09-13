"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mintDeviceToken } from "@/app/widget/actions";
import { setupMacCopy } from "@/lib/setup-mac-copy";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { has_token?: boolean; hostname?: string; bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// One click: mint a token for THIS team (the user never sees it), then the
// app installs the CLI, plugin and hooks (setup::bootstrap in
// widget/src-tauri/src/setup.rs). `done` is the server's view — a live token
// for this user in this team. While it is false we ALWAYS mint, even if the
// Mac already holds a token: that token belongs to another team, and the CLI
// overwrites config.json's token when one is passed (devbrain bootstrap
// --token). Re-running once done passes no token and keeps the current one.
export function SetupMac({ done, orgId, orgName }: { done: boolean; orgId: string; orgName: string }) {
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
      let token: string | null = null;
      if (!done) {
        const label = (setup?.hostname ?? "").trim().slice(0, 60) || "my-mac";
        const minted = await mintDeviceToken(label, orgId);
        if ("error" in minted) throw new Error(minted.error);
        token = minted.token;
      }
      await c.invoke("bootstrap", { server: window.location.origin, token, remindersList: null, remindersRepo: null });
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
  const copy = setupMacCopy({ done, hasToken: Boolean(setup?.has_token), orgName });
  const failed = setup?.bootstrap_failed ?? [];
  return (
    <div>
      {copy.note && <p className="mb-2 text-[12.5px] text-wait">{copy.note}</p>}
      <button type="button" onClick={run} disabled={busy || setup === null} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
        {busy ? "Setting up…" : copy.button}
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
