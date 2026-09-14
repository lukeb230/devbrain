"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mintDeviceToken } from "@/app/widget/actions";
import { macSetupState, setupMacCopy } from "@/lib/setup-mac-copy";

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
type Setup = { has_token?: boolean; hostname?: string; bootstrap_ok?: boolean | null; bootstrap_failed?: string[]; bootstrap_at?: string | null; configured?: boolean };

const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

// The whole "Set up this Mac" row, client-side, because only the app knows
// which machine it is running on. The server hands over the live token labels
// for this team (liveLabels); the app reports its hostname, whether a token is
// on disk, and how the last bootstrap ended; macSetupState combines them.
//
// The button ALWAYS mints a fresh token for this team and hands it to the
// bootstrap, so a click always points this Mac at the team on screen.
// mintDeviceToken revokes the Mac's previous same-name token, so a re-run
// leaves one live token per machine.
export function MacStep({ n, liveLabels, orgId, orgName }: { n: number; liveLabels: string[]; orgId: string; orgName: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [bridge, setBridge] = useState<boolean | null>(null);

  useEffect(() => {
    const c = core();
    setBridge(Boolean(c));
    c?.invoke("setup_state").then((s) => setSetup(s as Setup)).catch(() => setSetup({}));
  }, []);

  // The label the mint will store, computed ONCE: mintDeviceToken trims and
  // cuts to 60 chars, so a long machine name is stored short. macSetupState
  // must compare that same short label — a Mac named longer than 60 chars
  // would otherwise never match its own token, so the row could never turn
  // green and the copy would keep claiming another team owns it.
  const label = (setup?.hostname ?? "").trim().slice(0, 60);
  const { doneHere } = macSetupState({ liveLabels, hostname: label, hasToken: Boolean(setup?.has_token), bootstrapOk: setup?.bootstrap_ok });
  const copy = setupMacCopy({ done: doneHere, hasToken: Boolean(setup?.has_token), orgName });
  const failed = setup?.bootstrap_failed ?? [];

  async function run() {
    const c = core();
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      const minted = await mintDeviceToken(label || "my-mac", orgId);
      if ("error" in minted) throw new Error(minted.error);
      await c.invoke("bootstrap", { server: window.location.origin, token: minted.token, remindersList: null, remindersRepo: null });
      setSetup((await c.invoke("setup_state")) as Setup);
      router.refresh();
    } catch (e) {
      setErr(String(e).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="grid grid-cols-[32px_1fr] gap-4 border-t border-line py-[18px]">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${doneHere ? "bg-go text-white" : "border border-line2 text-txt"}`}>{doneHere ? "✓" : n}</span>
      <div className="min-w-0">
        <div className={`font-display text-[18px] font-medium ${doneHere ? "text-go" : "text-txt"}`}>Set up this Mac</div>
        <div className="mt-1.5 text-[12.5px] leading-[1.6] text-muted">
          One click installs the DevBrain command, the editor plugin and its hooks for Claude Code, Cursor and Codex, and keeps them updated. You&apos;ll be asked to allow Notifications and Reminders.
          <div className="mt-2">
            {bridge === false ? (
              <p className="text-[12.5px] text-muted">Open this page inside the DevBrain app to set up this Mac.</p>
            ) : (
              <div>
                {copy.note && <p className="mb-2 text-[12.5px] text-wait">{copy.note}</p>}
                <button type="button" onClick={run} disabled={busy || setup === null} className="rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white disabled:opacity-60">
                  {busy ? "Setting up…" : copy.button}
                </button>
                {setup?.bootstrap_at && (
                  <p className="mt-2 text-[12.5px] text-muted">
                    {setup.bootstrap_ok === false ? `${failed.join(", ") || "a part"} failed — re-running is safe and only fixes what's missing.` : doneHere ? "All parts installed on this Mac." : `This Mac was last set up for another team. Set it up for ${orgName} to point it here.`}
                  </p>
                )}
                {err && <p className="mt-2 text-[12.5px] text-stop">{err}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
