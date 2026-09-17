# Account page on the website — design

Decided 2026-09-17 with Luke. Prompted by two observations after the
support channel shipped: the site header has no Support link, and a
signed-in visitor has nothing to do on the website — no sign-out, no way
to see or manage their account.

## Goal

A signed-in person can, from the website alone: see who they are, sign
out, see every team they belong to and leave or delete one, see each
team's plan, revoke a device token, and delete their account. The header
shows Support beside FAQ and, when signed in, the person's login as a way
to the account page.

## Non-goals

- Editing name or email (GitHub owns them).
- Transferring team ownership (the Console's Members page has it).
- Billing changes beyond a link to the existing browser-reachable plan page.
- Team settings, rules, reminders, repos — all Console.

## Decisions

- Route `/account`, browser-reachable, site shell (same as `/support`).
- Signed out → redirect to `/?next=/account`; sign-in returns there.
- Header signed in: `login` (link to `/account`) + "Open the Console". Signed
  out: FAQ · Support · Download.
- Devices section included (privacy §9 already promises token revocation).
- Account deletion: typed phrase `delete my account`; blocked while the
  person is the sole owner of a team with other members, or sole member of a
  team with a live paid subscription; teams where they are the only member
  are deleted with the account; then the auth user is deleted (FKs cascade);
  sign out; land on `/?deleted=1` with a notice.
- Leave/delete-team and revoke-token logic moves into shared lib functions
  used by both the Console actions and the account actions — one behaviour.

## What already exists

- `POST /auth/sign-out` (no `from` → lands on `/`), `clearDevbrainCookies`.
- `leaveOrg` / `deleteOrg` (`src/app/settings/org|members/actions.ts`) —
  act on `currentOrg()` (cookie-selected team); sole-owner guard; typed team
  name for delete; `orgs` delete cascades everything.
- `revokeToken` (`src/app/settings/tokens/actions.ts`) — own token, current
  team only.
- `currentOrg()` → `{ userId, login, orgs: [{id, name, role}], … }`.
- `loadBilling(orgId)` → `{ plan: {name}, status, betaFree, hasSubscription, … }`;
  `orgs.billing_status ∈ trialing|active|past_due|canceled|comped`,
  `orgs.stripe_subscription_id`.
- `/desk/plan` is in `BROWSER_OK` (billing must work without the app).
- FKs to `auth.users` cascade for `org_members`, `dev_tokens`, `sessions`,
  `claims`, `device_logins`; `reports.user_id` sets null.
- Root page already accepts `?next=` for the post-sign-in destination and
  shows notices for `auth_error` / `device_error`.
- `SiteHeader({ current?: "faq"; signedIn?: boolean })` from the 2026-09-17
  homepage fix.

## Architecture

### Pure rules: `src/lib/account.ts`

No I/O.

- `DELETE_PHRASE = "delete my account"`.
- `type TeamStanding = { orgId; name; role; ownerCount; memberCount; billingStatus; hasSubscription }`.
- `canLeave(t)`: false when `role === "owner" && ownerCount <= 1 && memberCount > 1`
  (sole owner with others) — matches the Console's rule; a sole member may
  always leave (which deletes nothing; the team is left empty — see below).
- `deletionPlan(teams)` →
  `{ ok: true; deleteOrgIds: string[] }` when every team is either
  (a) `memberCount === 1` (delete it) or (b) `role !== "owner" || ownerCount > 1`
  (just leave);
  `{ ok: false; blockers: { orgId; name; reason: "sole_owner_with_members" | "paid_subscription" }[] }`
  otherwise. `paid_subscription` = `memberCount === 1 && hasSubscription && billingStatus ∈ active|past_due`.
- `leaveEmptiesTeam(t)`: `memberCount === 1` — the UI says "you're the last
  member; leaving deletes the team" and calls delete-team instead.

### Shared membership lib: `src/lib/membership.ts`

Thin, I/O, no `cookies()`/`redirect()` — the callers own those.

- `leaveOrgAs(admin, userId, orgId)`: delete `org_members` row; revoke that
  user's live `dev_tokens` in that org.
- `deleteOrgAs(admin, orgId)`: delete the `orgs` row (cascade).
- `revokeTokenAs(admin, userId, tokenId)`: revoke where `user_id = userId`
  (any team — the account page is cross-team; the Console's action keeps
  adding its `org_id` filter).
- `ownerCounts(admin, orgIds)` / `memberCounts(admin, orgIds)` →
  `Map<orgId, number>`.

`leaveOrg`, `deleteOrg`, `revokeToken` in `src/app/settings/*` call these
and keep their redirects/cookie handling unchanged.

### Actions: `src/app/account/actions.ts`

All `"use server"`, all require `currentUser()`.

- `leaveTeam(formData{orgId})`: membership must exist; owner guard via
  `canLeave`; `leaveOrgAs`; if it was the cookie-selected org, clear the org
  + last-repo cookies; `revalidatePath("/account")`.
- `deleteTeam(formData{orgId, confirm})`: role owner; `confirm === orgName`;
  `deleteOrgAs`; clear cookies as above; revalidate.
- `revokeDevice(formData{id})`: `revokeTokenAs`; revalidate.
- `deleteAccount(prev, formData{confirm})` → `AccountDeleteState =
  { ok: false; message: string; blockers?: … } | null`:
  phrase check → build `TeamStanding[]` → `deletionPlan` → blockers ⇒ return
  them → delete `deleteOrgIds` → `admin.auth.admin.deleteUser(userId)` →
  `supabase.auth.signOut()` → `clearDevbrainCookies` → `redirect("/?deleted=1")`.

### Page: `src/app/account/page.tsx` + `account-body.tsx`

- Server page: `currentUser()` or redirect `/?next=/account`; `currentOrg()`
  may be null (no team yet — the page still renders You / Devices / Delete).
  Loads per-team owner/member counts, `loadBilling` for teams where
  `role ∈ owner|admin`, and the user's live top-level tokens joined with
  team names. Passes plain props to `AccountBody`.
- `AccountBody` (server component, no hooks) renders sections: You · Teams ·
  Devices · Your data · Delete account. Forms post to the actions above;
  the delete-account form is a small client component (`delete-account.tsx`)
  using `useActionState` so blockers render inline.
- Team row: name, role pill, "Open in the Console" → `/open?to=/desk`
  (after `pickOrg`-style cookie set: use a form posting to `switchOrg` with
  `orgId` and `next=/open?to=/desk`), Plan line for admins ("Free beta" when
  `betaFree`, else `plan.name · status`) linking `/desk/plan`, Leave (or
  "Delete team" when sole member / owner) with the confirm input for delete.
- Copy for blockers: "You're the only owner of **X** and it has other
  members — make someone else an owner in the Console, or delete the team."
  / "**X** has a paid plan — cancel it on the plan page first."

### Header and root page

- `SiteHeader({ current?: "faq" | "support" | "account"; account?: { login: string } | null })`.
  Nav: FAQ · Support · then `account ? <login → /account> + Open the Console : Download`.
  `signedIn` boolean is replaced by `account`; `Landing` passes
  `account={user ? { login } : null}` (login derived the same way `org.ts`
  does — extract `loginOf(user)` into `src/lib/org.ts` export).
- `/support` passes `current="support"`; `/account` passes `current="account"`.
- Root page: `?deleted=1` shows the notice "Your account is deleted. Thanks
  for trying DevBrain." Signed-out `/account` → `/?next=/account`.
- `app-only.ts` `BROWSER_OK` gains `/^\/account(\/|$)/` and the comment list.

### Privacy

§9 "Your controls and rights": add a bullet — "delete your account from
the website's Account page, which removes your memberships, device tokens
and sessions, and deletes any team you were the only member of;" and note
support requests keep their text without the account link.

## Failure handling

| case | behaviour |
|---|---|
| leave as sole owner with members | button disabled with the explanation; action refuses |
| delete-team confirm mismatch | action returns, page unchanged (same as Console) |
| deleteAccount blocked | state carries blockers; nothing deleted |
| `deleteUser` fails after orgs deleted | state `{ ok:false, message:"Something went wrong deleting your account. Email team@…" }`; orgs already gone — acceptable, they were sole-member teams the person asked to delete |
| signed-out POST to any action | action returns silently (no session) |

## Testing

- `src/lib/__tests__/account.test.ts`: `canLeave`, `deletionPlan` (sole
  member → delete; member of others → leave; sole owner with members →
  blocker; paid sole-member → blocker; mixed), `leaveEmptiesTeam`.
- `src/lib/__tests__/account-actions.test.ts`: mocked supabase/org/cookies;
  `deleteAccount` refuses wrong phrase, returns blockers, deletes orgs then
  user then redirects; `leaveTeam` owner guard; `revokeDevice` scopes to
  `user_id`.
- `src/lib/__tests__/site-copy.test.tsx`: header states (signed out shows
  Support + Download; signed in shows login → `/account` + Open the
  Console; `current="support"` highlights).
- `src/lib/__tests__/account-body.test.tsx`: `renderToStaticMarkup` of
  `AccountBody` with fixture props — sections present, sole-owner row has
  no Leave form, sole-member row offers Delete team, devices list, delete
  phrase input.
- `legal-doc.test.ts`: §9 bullet present.

Live gate: throwaway GitHub account → sign in → `/account` shows no teams
→ join Luke's test team via invite → `/account` lists it (member) → revoke
its device token → leave → create own team from `/welcome` → `/account`
shows sole-member team with "Delete team" → delete account with the phrase
→ lands on `/?deleted=1`; Supabase shows the user, membership and org gone.

## Rollout order

1. `src/lib/account.ts` + tests.
2. `src/lib/membership.ts`; refactor the three Console actions to use it;
   existing tests stay green.
3. `src/app/account/actions.ts` + tests.
4. Header (Support link, account state) + root-page notice + `BROWSER_OK`;
   header tests.
5. `/account` page + `AccountBody` + `delete-account.tsx`; render test.
6. Privacy §9 + test.
7. Deploy, live gate.
