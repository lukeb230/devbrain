"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { kindsFor, trimContext, type ReportKind } from "@/lib/reports";
import { submitReport, type ReportState } from "@/app/support/actions";

// ============================================================================
// Help (Dusk) — two forms, bug and feature request, side by side. The person
// is signed in, so no email field and no honeypot; the team is attached by
// the action. What the app knows about itself (version, channel, last setup
// result) is read from the bridge on mount and sent as `context`, so nobody
// has to type "0.4.12, stable" into a bug report. In a plain browser the
// bridge is absent and the context is just the page and the user agent.
// No DeskNext: submitReport returns state and never redirects.
// ============================================================================

type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

const COPY: Record<Exclude<ReportKind, "support">, { title: string; sub: string; subject: string; message: string; button: string }> = {
  bug: { title: "Report a bug", sub: "Something broke, or does the wrong thing.", subject: "What broke, in a few words", message: "What did you do, what did you expect, and what happened?", button: "Send bug report" },
  feature: { title: "Request a feature", sub: "Something you wish DevBrain did.", subject: "What would you like it to do?", message: "What would it solve for you or your team?", button: "Send request" },
};

const ATTACH_NOTE = "We attach your app version, channel, team name and last setup result so you don't have to.";
const FIELD = "w-full rounded-lg border border-line2 bg-ink px-3 py-2 text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";

function useBridgeContext(): string {
  const [ctx, setCtx] = useState("{}");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const base: Record<string, unknown> = { page: window.location.pathname, user_agent: navigator.userAgent };
      const c = core();
      if (c) {
        const [setup, prefs] = await Promise.all([
          c.invoke("setup_state").then((v) => v ?? {}, () => ({})) as Promise<{ app_version?: string; bootstrap_ok?: boolean | null; bootstrap_at?: string | null }>,
          c.invoke("mac_prefs").then((v) => v ?? {}, () => ({})) as Promise<{ channel?: string }>,
        ]);
        Object.assign(base, { app_version: setup.app_version, channel: prefs.channel, bootstrap_ok: setup.bootstrap_ok, bootstrap_at: setup.bootstrap_at });
      }
      if (!cancelled) setCtx(JSON.stringify(trimContext(base)));
    })();
    return () => { cancelled = true; };
  }, []);
  return ctx;
}

function ReportForm({ kind, context }: { kind: Exclude<ReportKind, "support">; context: string }) {
  const [state, action, pending] = useActionState<ReportState, FormData>(submitReport, null);
  const id = useId();
  const doneRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (state?.ok) doneRef.current?.focus(); }, [state?.ok]);
  const copy = COPY[kind];

  return (
    <section>
      <div className="flex items-baseline gap-2.5 border-b border-line pb-2.5">
        <h3 className="m-0 font-display text-[14px] font-semibold text-txt">{copy.title}</h3>
        <span className="ml-auto text-[11.5px] text-faint">{copy.sub}</span>
      </div>
      {state?.ok ? (
        <p ref={doneRef} tabIndex={-1} role="status" aria-live="polite" className="mt-4 rounded-lg border border-[var(--wg-go-line)] bg-[var(--wg-go-bg)] px-3 py-2.5 text-[13px] leading-[1.55] text-go focus:outline-none">
          {state.ref ? <>Thanks. Your reference is <b>{state.ref}</b>. A copy is in your email — reply to it if there&apos;s more to add.</> : <>Thanks.</>}
        </p>
      ) : (
        <form action={action} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="source" value="console" />
          <input type="hidden" name="context" value={context} />
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">Subject</span>
            <input id={`${id}-subject`} name="subject" type="text" required maxLength={120} placeholder={copy.subject} className={FIELD} />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-muted">What happened</span>
            <textarea id={`${id}-message`} name="message" required minLength={20} maxLength={5000} rows={6} placeholder={copy.message} className={`${FIELD} resize-y`} />
          </label>
          {state && !state.ok && <p role="alert" className="text-[12.5px] text-stop">{state.message}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pending} className="rounded-lg bg-accent2 px-3.5 py-2 font-display text-[12px] font-semibold text-white hover:opacity-90 disabled:opacity-60">{pending ? "Sending…" : copy.button}</button>
          </div>
          <p className="text-[11.5px] leading-[1.5] text-faint">{ATTACH_NOTE}</p>
        </form>
      )}
    </section>
  );
}

export function HelpForms() {
  const context = useBridgeContext();
  return (
    <div className="grid grid-cols-2 gap-9">
      {(kindsFor("console") as Exclude<ReportKind, "support">[]).map((k) => <ReportForm key={k} kind={k} context={context} />)}
    </div>
  );
}
