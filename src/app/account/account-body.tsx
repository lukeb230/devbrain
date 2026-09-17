// src/app/account/account-body.tsx
import Link from "next/link";
import { canLeave, leaveEmptiesTeam, type TeamStanding } from "@/lib/account";
import { LEGAL } from "@/lib/legal";
import { switchOrg } from "@/app/settings/org/actions";
import { deleteTeam, leaveTeam, revokeDevice } from "./actions";
import { DeleteAccountForm } from "./delete-account";

// ============================================================================
// The account page's sections, from plain props: You · Teams · Devices ·
// Your data · Delete account. Everything the person can do here posts to
// src/app/account/actions.ts; the words come from the rules in
// src/lib/account.ts so the page and the actions agree.
// ============================================================================

export type AccountTeam = TeamStanding & {
  plan: { name: string; status: string; betaFree: boolean } | null; // null for plain members
  active: boolean; // the cookie-selected team
};
export type AccountDevice = { id: string; label: string; team: string; lastUsedAt: string | null };
export type AccountProps = { login: string; email: string | null; teams: AccountTeam[]; devices: AccountDevice[] };

const H2 = "font-display text-[22px] font-medium leading-[1.2] tracking-[-.015em] text-txt";
const BTN = "rounded-lg border border-line2 px-3 py-1.5 font-display text-[12.5px] font-semibold text-txt hover:border-line3 disabled:cursor-not-allowed disabled:opacity-50";
const DANGER = "rounded-lg border border-[var(--wg-stop-line)] px-3 py-1.5 font-display text-[12.5px] font-semibold text-stop hover:bg-[var(--wg-stop-bg)]";
const INPUT = "rounded-lg border border-line2 bg-ink px-2.5 py-1.5 text-[12.5px] text-txt placeholder:text-faint focus:border-accent focus:outline-none";

function when(iso: string | null): string {
  if (!iso) return "never used";
  const d = Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000);
  return d <= 0 ? "used today" : d === 1 ? "used yesterday" : `used ${d} days ago`;
}

function TeamRow({ t }: { t: AccountTeam }) {
  const alone = leaveEmptiesTeam(t);
  const mayLeave = canLeave(t);
  const owner = t.role === "owner";
  return (
    <li className="border-t border-line2 py-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-display text-[17px] font-medium text-txt">{t.name}</span>
        <span className="rounded-md border border-line2 px-1.5 py-px font-mono text-[10.5px] uppercase tracking-[.08em] text-muted">{t.role}</span>
        {t.active && <span className="text-[12px] text-faint">current</span>}
        <span className="text-[12.5px] text-muted">{t.memberCount === 1 ? "just you" : `${t.memberCount} people`}</span>
      </div>
      {t.plan && (
        <p className="mt-1.5 text-[13px] text-body">
          Plan: {t.plan.betaFree ? "Free beta" : `${t.plan.name} · ${t.plan.status}`} · <Link href="/desk/plan" className="text-accenttext hover:underline">plan page</Link>
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        <form action={switchOrg}>
          <input type="hidden" name="orgId" value={t.orgId} />
          {/* returnTo() only accepts paths its ALLOWED pattern matches (/desk, /widget,
              /dashboard — with or without a following path/query). Neither "/open" nor
              "/open?to=/desk" match that prefix, so "/desk" is the value that both passes
              returnTo() and lands on the Console's own home. */}
          <input type="hidden" name="next" value="/desk" />
          <button className={BTN}>Open in the Console</button>
        </form>
        {!alone && (
          <form action={leaveTeam}>
            <input type="hidden" name="orgId" value={t.orgId} />
            <button className={BTN} disabled={!mayLeave} title={mayLeave ? undefined : `You're the only owner of ${t.name}`}>Leave team</button>
          </form>
        )}
        {owner && (
          <form action={deleteTeam} className="flex items-center gap-2">
            <input type="hidden" name="orgId" value={t.orgId} />
            <input name="confirm" type="text" autoComplete="off" placeholder={t.name} aria-label={`Type ${t.name} to confirm`} className={INPUT} />
            <button className={DANGER}>Delete team</button>
          </form>
        )}
      </div>
      {!mayLeave && !alone && <p className="mt-2 text-[12.5px] text-muted">You're the only owner of {t.name} and it has other members — make someone else an owner in the Console before leaving, or delete the team.</p>}
      {alone && owner && <p className="mt-2 text-[12.5px] text-muted">You're the only member. Deleting the team removes everything in it.</p>}
    </li>
  );
}

export function AccountBody({ login, email, teams, devices }: AccountProps) {
  return (
    <div className="flex flex-col gap-14">
      <section>
        <h2 className={H2}>You</h2>
        <p className="mt-2 text-[14.5px] text-body"><span className="font-mono">{login}</span>{email ? <> · {email}</> : null}</p>
        <p className="mt-1 text-[12.5px] text-muted">Sign-in is through GitHub; your name and email come from there.</p>
        <form action="/auth/sign-out" method="post" className="mt-4"><button className={BTN}>Sign out</button></form>
      </section>

      <section>
        <h2 className={H2}>Teams</h2>
        {teams.length === 0 ? (
          <p className="mt-2 text-[14px] text-body">You&apos;re not in a team yet. <Link href="/welcome" className="text-accenttext hover:underline">Create or join one</Link>.</p>
        ) : (
          <ul className="mt-3">{teams.map((t) => <TeamRow key={t.orgId} t={t} />)}</ul>
        )}
      </section>

      <section>
        <h2 className={H2}>Devices</h2>
        <p className="mt-1 text-[12.5px] text-muted">Each Mac you set up holds a token. Revoke one and that Mac stops talking to DevBrain until it is set up again.</p>
        {devices.length === 0 ? (
          <p className="mt-2 text-[14px] text-body">No devices.</p>
        ) : (
          <ul className="mt-3">
            {devices.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 border-t border-line2 py-3">
                <span className="text-[14px] text-txt">{d.label}</span>
                <span className="text-[12.5px] text-muted">{d.team} · {when(d.lastUsedAt)}</span>
                <form action={revokeDevice} className="ml-auto"><input type="hidden" name="id" value={d.id} /><button className={DANGER}>Revoke</button></form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className={H2}>Your data</h2>
        <p className="mt-2 max-w-[60ch] text-[14px] leading-[1.6] text-body">To get a copy of the data we hold about you or your team, or to have it corrected, <Link href="/support" className="text-accenttext hover:underline">ask on the support page</Link> — export is a manual step today. The <Link href="/privacy" className="text-accenttext hover:underline">privacy page</Link> says what is kept and for how long.</p>
      </section>

      <section>
        <h2 className={H2}>Delete account</h2>
        <div className="mt-3 max-w-[560px]"><DeleteAccountForm /></div>
        <p className="mt-3 text-[12px] text-faint">Questions first? {LEGAL.contact}</p>
      </section>
    </div>
  );
}
