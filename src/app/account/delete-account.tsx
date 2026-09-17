// src/app/account/delete-account.tsx
"use client";

import { useActionState } from "react";
import { blockerCopy, DELETE_PHRASE } from "@/lib/account";
import { deleteAccount, type AccountDeleteState } from "./actions";

// The one part of the page that needs state: the delete form shows the
// rule that stopped it (a team you solely own, a paid plan) inline, so
// fixing the blocker and retrying is one step.
export function DeleteAccountForm() {
  const [state, action, pending] = useActionState<AccountDeleteState, FormData>(deleteAccount, null);
  return (
    <form action={action} className="flex flex-col gap-3">
      <p className="text-[13.5px] leading-[1.6] text-body">This removes your memberships, device tokens and sessions, deletes any team you are the only member of, and signs you out. Support requests you sent keep their text without your account. It cannot be undone.</p>
      <label className="block text-[12.5px] text-muted">
        Type <b className="text-txt">{DELETE_PHRASE}</b> to confirm
        <input name="confirm" type="text" autoComplete="off" required placeholder={DELETE_PHRASE} className="mt-1.5 block w-full max-w-[360px] rounded-lg border border-line2 bg-ink px-3 py-2 text-[13.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none" />
      </label>
      {state && !state.ok && (
        <div role="alert" className="rounded-lg border border-[var(--wg-stop-line)] bg-[var(--wg-stop-bg)] px-3 py-2.5 text-[13px] leading-[1.55] text-stop">
          <p>{state.message}</p>
          {state.blockers && <ul className="mt-1.5 list-disc pl-5">{state.blockers.map((b) => <li key={b.orgId}>{blockerCopy(b)}</li>)}</ul>}
        </div>
      )}
      <button type="submit" disabled={pending} className="w-fit rounded-lg border border-[var(--wg-stop-line)] px-3.5 py-2 font-display text-[13px] font-semibold text-stop hover:bg-[var(--wg-stop-bg)] disabled:opacity-60">{pending ? "Deleting…" : "Delete my account"}</button>
    </form>
  );
}
