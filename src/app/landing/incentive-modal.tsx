"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmailForm } from "./email-form";
import { onceInView } from "./in-view";

// ============================================================================
// The one popup. It offers the thing that is actually true — the beta is free,
// there is no card, and the places are genuinely limited — and nothing more.
// No invented discount, no "beta pricing locked in forever": that is a
// commercial promise only the operator can make, and a landing page that
// invents one writes a cheque somebody else has to honour.
//
// Rules it follows, because interruptive UI that ignores them is worse than
// none: it appears once per visitor ever, on exit intent or deep scroll,
// never above the fold, never while the beta is full. Escape closes it, focus
// is trapped and returned, the page behind it does not scroll, and the close
// control is a real button a screen reader can find.
// ============================================================================

const SEEN = "devbrain_offer_seen";

export function IncentiveModal({ spotsLeft, maxTeams }: { spotsLeft: number; maxTeams: number }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN, "1");
    } catch {}
    if (opener.current instanceof HTMLElement) opener.current.focus();
  }, []);

  // Arm the triggers once, and only for someone who has not seen it.
  //
  // Deliberately NOT a scroll listener: the page sets scroll-behavior smooth,
  // and under programmatic or smooth scrolling the scroll event does not
  // reliably fire — measured, after the first version silently never opened.
  // An IntersectionObserver on a sentinel at the foot of the page answers the
  // real question ("did they get to the end") without depending on events.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN) === "1";
    } catch {}
    if (seen) return;

    let fired = false;
    let timer = 0;
    let stopWatch: (() => void) | null = null;

    const show = () => {
      if (fired) return;
      fired = true;
      stopWatch?.();
      document.removeEventListener("mouseout", onOut);
      window.clearTimeout(timer);
      opener.current = document.activeElement;
      setOpen(true);
    };
    // The pointer leaves through the top of the window.
    function onOut(e: MouseEvent) {
      if (!e.relatedTarget && e.clientY <= 4) show();
    }

    if (sentinel.current) stopWatch = onceInView(sentinel.current, show);
    document.addEventListener("mouseout", onOut);
    // Floor, for a reader who neither reaches the end nor leaves upward.
    timer = window.setTimeout(show, 50_000);

    return () => {
      stopWatch?.();
      document.removeEventListener("mouseout", onOut);
      window.clearTimeout(timer);
    };
  }, []);

  // Escape, focus trap, and no scrolling behind the dialog.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Prefer the field over the close button: it is the primary action.
    const first = card.current?.querySelector<HTMLElement>("input[type=email]") ?? card.current?.querySelector<HTMLElement>("button,a");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return close();
      if (e.key !== "Tab" || !card.current) return;
      const f = [...card.current.querySelectorAll<HTMLElement>('a[href],button,input,[tabindex]:not([tabindex="-1"])')].filter((n) => !n.hasAttribute("disabled"));
      if (!f.length) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  // The sentinel must render whether or not the dialog is open.
  const mark = <div ref={sentinel} aria-hidden="true" className="h-px w-full" />;

  if (!open) return mark;

  return (
    <>
      {mark}
    <div className="fixed inset-0 z-[100] grid place-items-center p-5">
      <button aria-label="Close" tabIndex={-1} onClick={close} className="absolute inset-0 cursor-default bg-[#1d1b17]/45 backdrop-blur-[2px]" />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="offer-title"
        className="relative w-full max-w-[460px] rounded-2xl border border-line2 bg-ink p-7 shadow-[0_1px_2px_rgba(60,40,20,.12),0_30px_80px_rgba(60,40,20,.34)]"
      >
        <div className="flex items-center gap-2.5">
          <span className="h-[7px] w-[7px] rounded-full bg-go" />
          <span className="font-mono text-[13px] font-medium tabular-nums text-txt">{spotsLeft}</span>
          <span className="text-[13px] text-muted">of {maxTeams} beta places left</span>
          <button onClick={close} className="-m-2 ml-auto p-2 text-[18px] leading-none text-muted hover:text-txt" aria-label="Close">×</button>
        </div>

        <h2 id="offer-title" className="mt-4 font-display text-[25px] font-medium leading-[1.12] tracking-[-.025em] text-txt">
          Take one of them before you go.
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-body">
          DevBrain is free while the beta runs — no card, nothing to cancel, and you keep your place
          when it ends. Put it on one repo and see whether the collisions stop.
        </p>

        <div className="mt-6">
          <EmailForm label="Where should I send your invite?" />
        </div>
        <p className="mt-3 text-[12.5px] text-muted">
          One email, when there is something to say. No sequence, no newsletter.
        </p>
      </div>
    </div>
    </>
  );
}
