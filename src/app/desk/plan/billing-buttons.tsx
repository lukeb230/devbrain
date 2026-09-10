"use client";

import { useState, useTransition } from "react";
import type { PlanId } from "@/lib/billing/plans";
import { Button } from "../ui";
import { changePlan, openPortal, startCheckout, type BillingResult } from "./actions";

// Stripe pages open outside the app window: through the shell's
// open_external in the Console, a normal navigation in a browser.
function openOutside(url: string) {
  const core = (window as unknown as { __TAURI__?: { core?: { invoke: (c: string, a?: Record<string, unknown>) => Promise<unknown> } } }).__TAURI__?.core;
  if (core) void core.invoke("open_external", { url }).catch(() => window.open(url, "_blank"));
  else window.location.assign(url);
}

export function BillingButtons({ plan, hasSubscription, canManage }: { plan: PlanId; hasSubscription: boolean; canManage: boolean }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  if (!canManage) return <p className="mt-3 text-[12px] text-faint">Admins manage the plan.</p>;
  const run = (fn: () => Promise<BillingResult | { ok: true } | { error: string }>) =>
    start(async () => {
      setNote(null);
      const r = await fn();
      if ("error" in r) setNote(r.error);
      else if ("url" in r) { setNote("Opening Stripe in your browser…"); openOutside(r.url); }
      else setNote("Plan updated.");
    });
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hasSubscription ? (
          <>
            <Button onClick={() => run(() => startCheckout("base"))} disabled={pending}>Start Base · $29/mo</Button>
            <Button tone="ghost" onClick={() => run(() => startCheckout("scale"))} disabled={pending}>Start Scale · $99/mo</Button>
          </>
        ) : (
          <>
            {plan === "base" ? (
              <Button onClick={() => run(() => changePlan("scale"))} disabled={pending}>Upgrade to Scale · $99/mo</Button>
            ) : (
              <Button tone="ghost" onClick={() => run(() => changePlan("base"))} disabled={pending}>Move to Base · $29/mo</Button>
            )}
            <Button tone="ghost" onClick={() => run(openPortal)} disabled={pending}>Manage billing</Button>
          </>
        )}
      </div>
      {note && <p className="mt-2 text-[12px] text-muted">{note}</p>}
    </div>
  );
}
