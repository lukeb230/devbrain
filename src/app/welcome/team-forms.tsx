// The two ways into a team — create one, or paste an invite link — as one
// component, so the browser page, the Console and the panel render the same
// forms. The actions are passed in (they are server actions; keeping them out
// of this file keeps it renderable in tests). `appNext` is "/desk" or
// "/widget" inside the app, null in the browser.
export function TeamForms({ appNext, full, inviteError = null, compact, createAction, joinAction }: {
  appNext: string | null;
  full: string | null;
  inviteError?: string | null;
  compact: boolean;
  createAction: (fd: FormData) => Promise<void>;
  joinAction: (fd: FormData) => Promise<void>;
}) {
  const input = "min-w-0 flex-1 rounded-lg border border-line2 bg-ink px-3 py-[9px] text-[13px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";
  const row = compact ? "flex flex-col gap-2" : "flex gap-2";
  return (
    <>
      {inviteError && <p className="mt-4 rounded-[10px] border border-[var(--wg-wait-line)] bg-[var(--wg-wait-bg)] px-3.5 py-2.5 text-[13px] text-wait">{inviteError}</p>}

      <section className="mt-6 rounded-xl border border-line bg-row p-4">
        <div className="font-display text-[17px] font-medium text-txt">Create a team</div>
        {full ? (
          <p className="mt-1 text-[12.5px] leading-[1.6] text-muted">{full} An invite link from someone already on DevBrain still works.</p>
        ) : (
          <>
            <p className="mb-2.5 mt-1 text-[12.5px] text-muted">You&apos;ll be its owner. Link repos and invite people next.</p>
            <form action={createAction} className={row}>
              {appNext && <input type="hidden" name="next" value={appNext} />}
              <input name="name" required maxLength={60} placeholder="Team name" className={input} />
              <button className="whitespace-nowrap rounded-lg bg-accent2 px-3.5 py-[9px] text-[12.5px] font-semibold text-white">Create team</button>
            </form>
          </>
        )}
      </section>

      <section className="mt-3 rounded-xl border border-line bg-row p-4">
        <div className="font-display text-[17px] font-medium text-txt">Join with an invite</div>
        <p className="mb-2.5 mt-1 text-[12.5px] text-muted">Paste the link a teammate sent you.</p>
        <form action={joinAction} className={row}>
          {appNext && <input type="hidden" name="next" value={appNext} />}
          <input name="invite" required placeholder="https://…/join/…" className={input} />
          <button className="whitespace-nowrap rounded-lg border border-line2 bg-row px-3.5 py-[9px] text-[12.5px] font-medium text-txt hover:border-line3">Join</button>
        </form>
      </section>
    </>
  );
}
