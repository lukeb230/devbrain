"use client";

// The panel is 440 px and the team step is the start of the walkthrough, so
// the panel does not host the forms; it opens the Console, which does.
// Outside the app (no Tauri bridge) the link falls back to the browser page.
type Core = { invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown> };
const core = (): Core | null => (window as unknown as { __TAURI__?: { core?: Core } }).__TAURI__?.core ?? null;

export function NoTeamPanel() {
  const open = () => {
    const c = core();
    if (!c) { window.location.href = "/welcome?from=widget"; return; }
    void c.invoke("open_desk", { route: "/desk" }).catch(() => { window.location.href = "/welcome?from=widget"; });
  };
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-6 text-center">
      <div className="font-display text-[22px] font-medium tracking-[-.02em] text-txt">One more step</div>
      <p className="mt-2 text-[13.5px] leading-[1.6] text-muted">You&apos;re signed in. Your team is set up in the Console — create one, or join with an invite link.</p>
      <button type="button" onClick={open} className="mx-auto mt-5 rounded-lg bg-accent2 px-4 py-[9px] text-[12.5px] font-semibold text-white">Open the Console</button>
    </main>
  );
}
