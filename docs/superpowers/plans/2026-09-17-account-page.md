# Account Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in visitor can, from the website, see who they are, sign out, manage their team memberships and device tokens, see each team's plan, and delete their account; the site header gains a Support link and a signed-in account state.

**Architecture:** One pure rules module (`src/lib/account.ts`), one shared I/O lib (`src/lib/membership.ts`) used by both the Console's existing actions and the new account actions, one server action module (`src/app/account/actions.ts`), and one site page (`/account`) rendered from plain props by `AccountBody`. Deletion cascades through existing foreign keys after `auth.admin.deleteUser`.

**Tech Stack:** Next.js 15 App Router (server actions, `useActionState`), React 19, Supabase (`@supabase/supabase-js` 2.x admin client), vitest.

**Spec:** `docs/superpowers/specs/2026-09-17-account-page-design.md`

## Global Constraints

- Work in `~/Downloads/devbrain-product` on branch `feat/account-page`. **The shell cwd resets to `~/Downloads/devbrain` (a frozen, unrelated repo) after every command. Prefix every command with `cd ~/Downloads/devbrain-product &&`.** Never edit `~/Downloads/devbrain`.
- Route `/account`, browser-reachable; signed out → `redirect("/?next=/account")`.
- Header nav order: FAQ · Support · (signed in: `login` → `/account`, then "Open the Console" → `/open`; signed out: "Download for Mac").
- Delete-account phrase, exact: `delete my account`.
- Deletion rules: blocked by `sole_owner_with_members` (role owner, ownerCount ≤ 1, memberCount > 1) or `paid_subscription` (memberCount = 1, hasSubscription, billingStatus ∈ `active`|`past_due`); teams with memberCount = 1 are deleted with the account; everything else is left by cascade.
- Delete-team confirm = the team's exact name (same as the Console).
- Copy, exact: root notice `Your account is deleted. Thanks for trying DevBrain.`; blocker copy `You're the only owner of X and it has other members — make someone else an owner in the Console, or delete the team.` and `X has a paid plan — cancel it on the plan page first.`
- No new dependencies. Tests: `npx vitest run` green; `npm run typecheck`; `npm run build`.
- Commit trailer on every commit:
  ```
  Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
  ```

---

## File Structure

| file | responsibility |
|---|---|
| `src/lib/account.ts` | pure: `DELETE_PHRASE`, `TeamStanding`, `canLeave`, `leaveEmptiesTeam`, `deletionPlan`, blocker copy |
| `src/lib/membership.ts` | I/O: `leaveOrgAs`, `deleteOrgAs`, `revokeTokenAs`, `ownerCounts`, `memberCounts` |
| `src/app/settings/members/actions.ts`, `src/app/settings/org/actions.ts`, `src/app/settings/tokens/actions.ts` | refactored to call `membership.ts` |
| `src/lib/org.ts` | + `loginOf(user)` export |
| `src/app/account/actions.ts` | `leaveTeam`, `deleteTeam`, `revokeDevice`, `deleteAccount` |
| `src/app/account/page.tsx` | data loading + shell |
| `src/app/account/account-body.tsx` | the page's sections from props |
| `src/app/account/delete-account.tsx` | client form with `useActionState` |
| `src/app/landing/landing.tsx` | `SiteHeader` Support link + account state; `Landing` passes `account` |
| `src/app/support/page.tsx` | `current="support"` |
| `src/app/page.tsx` | `?deleted=1` notice; passes `account` |
| `src/lib/app-only.ts` | `/account` in `BROWSER_OK` |
| `src/content/legal/privacy.md` | §9 bullet |
| tests | `account.test.ts`, `account-actions.test.ts`, `account-body.test.tsx`, edits to `site-copy.test.tsx`, `legal-doc.test.ts` |

---

### Task 1: Pure account rules

**Files:**
- Create: `src/lib/account.ts`
- Test: `src/lib/__tests__/account.test.ts`

**Interfaces:**
- Produces: `DELETE_PHRASE`, `type Role = "owner" | "admin" | "member"` (re-exported from `@/lib/org`), `type TeamStanding`, `type Blocker`, `canLeave(t)`, `leaveEmptiesTeam(t)`, `deletionPlan(teams)`, `blockerCopy(b)`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/account.test.ts
import { describe, expect, it } from "vitest";
import { blockerCopy, canLeave, DELETE_PHRASE, deletionPlan, leaveEmptiesTeam, type TeamStanding } from "@/lib/account";

const t = (o: Partial<TeamStanding>): TeamStanding => ({ orgId: "o", name: "Team", role: "member", ownerCount: 1, memberCount: 3, billingStatus: "trialing", hasSubscription: false, ...o });

describe("canLeave", () => {
  it("a member or admin can always leave", () => {
    expect(canLeave(t({ role: "member" }))).toBe(true);
    expect(canLeave(t({ role: "admin" }))).toBe(true);
  });
  it("the only owner cannot leave while others remain", () => {
    expect(canLeave(t({ role: "owner", ownerCount: 1, memberCount: 3 }))).toBe(false);
    expect(canLeave(t({ role: "owner", ownerCount: 2, memberCount: 3 }))).toBe(true);
  });
  it("the last member can leave (it empties the team)", () => {
    expect(canLeave(t({ role: "owner", ownerCount: 1, memberCount: 1 }))).toBe(true);
    expect(leaveEmptiesTeam(t({ memberCount: 1 }))).toBe(true);
    expect(leaveEmptiesTeam(t({ memberCount: 2 }))).toBe(false);
  });
});

describe("deletionPlan", () => {
  it("deletes the teams the person is alone in and leaves the rest", () => {
    const p = deletionPlan([t({ orgId: "solo", memberCount: 1, role: "owner" }), t({ orgId: "shared", role: "member" }), t({ orgId: "co", role: "owner", ownerCount: 2 })]);
    expect(p).toEqual({ ok: true, deleteOrgIds: ["solo"] });
  });
  it("is blocked by a team the person solely owns with others in it", () => {
    const p = deletionPlan([t({ orgId: "x", name: "Northwind", role: "owner", ownerCount: 1, memberCount: 4 })]);
    expect(p).toEqual({ ok: false, blockers: [{ orgId: "x", name: "Northwind", reason: "sole_owner_with_members" }] });
  });
  it("is blocked by a paid subscription on a team it would delete", () => {
    const paid = t({ orgId: "p", name: "Paid", role: "owner", memberCount: 1, hasSubscription: true, billingStatus: "active" });
    expect(deletionPlan([paid])).toEqual({ ok: false, blockers: [{ orgId: "p", name: "Paid", reason: "paid_subscription" }] });
    expect(deletionPlan([{ ...paid, billingStatus: "canceled" }])).toEqual({ ok: true, deleteOrgIds: ["p"] });
    expect(deletionPlan([{ ...paid, billingStatus: "comped", hasSubscription: false }])).toEqual({ ok: true, deleteOrgIds: ["p"] });
  });
  it("reports every blocker, not just the first", () => {
    const p = deletionPlan([t({ orgId: "a", name: "A", role: "owner", memberCount: 2 }), t({ orgId: "b", name: "B", role: "owner", memberCount: 1, hasSubscription: true, billingStatus: "past_due" })]);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.blockers.map((b) => b.reason)).toEqual(["sole_owner_with_members", "paid_subscription"]);
  });
  it("no teams is a plan with nothing to delete", () => {
    expect(deletionPlan([])).toEqual({ ok: true, deleteOrgIds: [] });
  });
});

describe("copy", () => {
  it("the phrase and the blocker sentences are exact", () => {
    expect(DELETE_PHRASE).toBe("delete my account");
    expect(blockerCopy({ orgId: "x", name: "Northwind", reason: "sole_owner_with_members" })).toBe("You're the only owner of Northwind and it has other members — make someone else an owner in the Console, or delete the team.");
    expect(blockerCopy({ orgId: "x", name: "Northwind", reason: "paid_subscription" })).toBe("Northwind has a paid plan — cancel it on the plan page first.");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account.test.ts`
Expected: FAIL — cannot resolve `@/lib/account`.

- [ ] **Step 3: Write the module**

```ts
// src/lib/account.ts
import type { Role } from "@/lib/org";

// ============================================================================
// The account page's rules, with no I/O: who may leave a team, which teams
// go with an account when it is deleted, and what stops a deletion. The
// page and its actions call in; the tests pin the words people see.
// ============================================================================

export const DELETE_PHRASE = "delete my account";

export type TeamStanding = {
  orgId: string;
  name: string;
  role: Role;
  ownerCount: number;
  memberCount: number;
  billingStatus: string;   // orgs.billing_status
  hasSubscription: boolean; // orgs.stripe_subscription_id is set
};

export type Blocker = { orgId: string; name: string; reason: "sole_owner_with_members" | "paid_subscription" };
export type DeletionPlan = { ok: true; deleteOrgIds: string[] } | { ok: false; blockers: Blocker[] };

/** The Console's rule: the only owner cannot walk out on a team that still
 *  has other people in it. Alone in the team, leaving is allowed — it
 *  empties the team, and the UI turns that into "delete team". */
export function canLeave(t: TeamStanding): boolean {
  if (t.role !== "owner") return true;
  if (t.memberCount <= 1) return true;
  return t.ownerCount > 1;
}

export function leaveEmptiesTeam(t: TeamStanding): boolean {
  return t.memberCount <= 1;
}

const PAID = new Set(["active", "past_due"]);

/** Which teams are deleted with the account, or why it cannot happen yet.
 *  Every blocker is reported so the person fixes them in one pass. */
export function deletionPlan(teams: TeamStanding[]): DeletionPlan {
  const blockers: Blocker[] = [];
  const deleteOrgIds: string[] = [];
  for (const t of teams) {
    if (t.memberCount <= 1) {
      if (t.hasSubscription && PAID.has(t.billingStatus)) blockers.push({ orgId: t.orgId, name: t.name, reason: "paid_subscription" });
      else deleteOrgIds.push(t.orgId);
      continue;
    }
    if (t.role === "owner" && t.ownerCount <= 1) blockers.push({ orgId: t.orgId, name: t.name, reason: "sole_owner_with_members" });
  }
  return blockers.length > 0 ? { ok: false, blockers } : { ok: true, deleteOrgIds };
}

export function blockerCopy(b: Blocker): string {
  return b.reason === "sole_owner_with_members"
    ? `You're the only owner of ${b.name} and it has other members — make someone else an owner in the Console, or delete the team.`
    : `${b.name} has a paid plan — cancel it on the plan page first.`;
}
```

Check that `Role` is exported from `src/lib/org.ts` (it is used there as `role: Role`); if it is not exported, add `export` to its declaration.

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/lib/account.ts src/lib/__tests__/account.test.ts src/lib/org.ts && git commit -F - <<'EOF'
Account: the pure rules — who may leave, what deletion takes with it, what blocks it

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 2: Shared membership lib, and the Console actions use it

**Files:**
- Create: `src/lib/membership.ts`
- Modify: `src/app/settings/members/actions.ts` (`leaveOrg`), `src/app/settings/org/actions.ts` (`deleteOrg`), `src/app/settings/tokens/actions.ts` (`revokeToken`)
- Test: `src/lib/__tests__/membership.test.ts`

**Interfaces:**
- Consumes: `supabaseAdmin()` (a supabase-js client).
- Produces: `leaveOrgAs(admin, userId, orgId)`, `deleteOrgAs(admin, orgId)`, `revokeTokenAs(admin, userId, tokenId, orgId?)`, `ownerCounts(admin, orgIds)`, `memberCounts(admin, orgIds)`, `hasSubscription`-bearing `teamBilling(admin, orgIds)` → `Map<orgId, { billingStatus, hasSubscription }>`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/membership.test.ts
import { describe, expect, it } from "vitest";
import { deleteOrgAs, leaveOrgAs, memberCounts, ownerCounts, revokeTokenAs, teamBilling } from "@/lib/membership";

// A recording stand-in for the admin client: every query is captured as
// {table, op, filters} so the tests assert WHAT is deleted/updated and
// with which scoping, not how supabase-js chains.
type Call = { table: string; op: string; patch?: unknown; filters: [string, string, unknown][] };
function fakeAdmin(rows: Record<string, unknown[]> = {}) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "", filters: [] };
    calls.push(call);
    const chain: Record<string, unknown> = {};
    const add = (name: string) => (chain[name] = (c: string, v: unknown) => { call.filters.push([name, c, v]); return chain; });
    ["eq", "is", "in"].forEach(add);
    chain.select = (_cols: string, opts?: { count?: string; head?: boolean }) => { call.op = opts?.head ? "count" : "select"; return chain; };
    chain.delete = () => { call.op = "delete"; return chain; };
    chain.update = (patch: unknown) => { call.op = "update"; call.patch = patch; return chain; };
    // Reads honour eq/in filters so count queries see only their rows.
    chain.then = (res: (v: unknown) => void) => {
      const data = (rows[table] ?? []).filter((r) => call.filters.every(([f, c, v]) => f === "eq" ? (r as Record<string, unknown>)[c] === v : f === "in" ? (v as unknown[]).includes((r as Record<string, unknown>)[c]) : true));
      return res({ data, error: null, count: data.length });
    };
    return chain;
  };
  return { admin: { from } as never, calls };
}

describe("membership", () => {
  it("leaveOrgAs removes the membership and revokes that person's live tokens in that team", async () => {
    const { admin, calls } = fakeAdmin();
    await leaveOrgAs(admin, "u1", "o1");
    expect(calls.map((c) => [c.table, c.op])).toEqual([["org_members", "delete"], ["dev_tokens", "update"]]);
    expect(calls[0].filters).toEqual([["eq", "org_id", "o1"], ["eq", "user_id", "u1"]]);
    expect(calls[1].filters).toEqual(expect.arrayContaining([["eq", "org_id", "o1"], ["eq", "user_id", "u1"], ["is", "revoked_at", null]]));
    expect(calls[1].patch).toMatchObject({ revoked_at: expect.any(String) });
  });
  it("deleteOrgAs deletes the org row only (the database cascades)", async () => {
    const { admin, calls } = fakeAdmin();
    await deleteOrgAs(admin, "o1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ table: "orgs", op: "delete", filters: [["eq", "id", "o1"]] });
  });
  it("revokeTokenAs is scoped to the person, and to the team only when asked", async () => {
    const a = fakeAdmin(); await revokeTokenAs(a.admin, "u1", "t1");
    expect(a.calls[0].filters).toEqual([["eq", "id", "t1"], ["eq", "user_id", "u1"]]);
    const b = fakeAdmin(); await revokeTokenAs(b.admin, "u1", "t1", "o1");
    expect(b.calls[0].filters).toEqual([["eq", "id", "t1"], ["eq", "user_id", "u1"], ["eq", "org_id", "o1"]]);
  });
  it("counts and billing come back keyed by org, zero/absent for teams with no rows", async () => {
    const { admin } = fakeAdmin({ org_members: [{ org_id: "o1", role: "owner" }, { org_id: "o1", role: "member" }, { org_id: "o2", role: "owner" }], orgs: [{ id: "o1", billing_status: "active", stripe_subscription_id: "sub_1" }, { id: "o2", billing_status: "trialing", stripe_subscription_id: null }] });
    expect(await ownerCounts(admin, ["o1", "o2", "o3"])).toEqual(new Map([["o1", 1], ["o2", 1], ["o3", 0]]));
    expect(await memberCounts(admin, ["o1", "o2", "o3"])).toEqual(new Map([["o1", 2], ["o2", 1], ["o3", 0]]));
    expect(await teamBilling(admin, ["o1", "o2"])).toEqual(new Map([["o1", { billingStatus: "active", hasSubscription: true }], ["o2", { billingStatus: "trialing", hasSubscription: false }]]));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/membership.test.ts`
Expected: FAIL — cannot resolve `@/lib/membership`.

- [ ] **Step 3: Write the lib**

```ts
// src/lib/membership.ts
import type { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// Membership and device-token changes, shared by the Console's actions and
// the website's account page so both do exactly the same thing. No cookies,
// no redirects — callers own those. `admin` is the service-role client.
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

/** Take one person out of one team and stop their machines talking to it. */
export async function leaveOrgAs(admin: Admin, userId: string, orgId: string): Promise<void> {
  await admin.from("org_members").delete().eq("org_id", orgId).eq("user_id", userId);
  await admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", userId).is("revoked_at", null);
}

/** Delete a team. Every row that belongs to it cascades in the database. */
export async function deleteOrgAs(admin: Admin, orgId: string): Promise<void> {
  await admin.from("orgs").delete().eq("id", orgId);
}

/** Revoke one of this person's tokens; `orgId` narrows it to one team (the
 *  Console's tokens page); without it, any of their teams (the account page). */
export async function revokeTokenAs(admin: Admin, userId: string, tokenId: string, orgId?: string): Promise<void> {
  let q = admin.from("dev_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", tokenId).eq("user_id", userId);
  if (orgId) q = q.eq("org_id", orgId);
  await q;
}

async function countBy(admin: Admin, orgIds: string[], onlyOwners: boolean): Promise<Map<string, number>> {
  const out = new Map(orgIds.map((id) => [id, 0]));
  if (orgIds.length === 0) return out;
  let q = admin.from("org_members").select("org_id, role").in("org_id", orgIds);
  if (onlyOwners) q = q.eq("role", "owner");
  const { data } = await q;
  for (const r of (data ?? []) as { org_id: string }[]) out.set(r.org_id, (out.get(r.org_id) ?? 0) + 1);
  return out;
}
export const ownerCounts = (admin: Admin, orgIds: string[]) => countBy(admin, orgIds, true);
export const memberCounts = (admin: Admin, orgIds: string[]) => countBy(admin, orgIds, false);

export async function teamBilling(admin: Admin, orgIds: string[]): Promise<Map<string, { billingStatus: string; hasSubscription: boolean }>> {
  const out = new Map<string, { billingStatus: string; hasSubscription: boolean }>();
  if (orgIds.length === 0) return out;
  const { data } = await admin.from("orgs").select("id, billing_status, stripe_subscription_id").in("id", orgIds);
  for (const r of (data ?? []) as { id: string; billing_status: string; stripe_subscription_id: string | null }[]) out.set(r.id, { billingStatus: r.billing_status, hasSubscription: Boolean(r.stripe_subscription_id) });
  return out;
}
```

- [ ] **Step 4: Refactor the three Console actions to call it**

In `src/app/settings/members/actions.ts`, `leaveOrg` becomes (keep its imports; add `import { leaveOrgAs } from "@/lib/membership";`):

```ts
export async function leaveOrg(formData?: FormData): Promise<void> {
  const me = await currentOrg();
  if (!me) return;
  const admin = supabaseAdmin();
  if (me.role === "owner") {
    const { count } = await admin.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", me.orgId).eq("role", "owner");
    if ((count ?? 0) <= 1) return; // hand ownership over first
  }
  await leaveOrgAs(admin, me.userId, me.orgId);
  clearDevbrainCookies(await cookies(), [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
  redirect(surfaceRoot(returnTo(formData, "/dashboard"))); // that surface's home picks another membership, or /welcome
}
```

In `src/app/settings/org/actions.ts`, `deleteOrg` (add `import { deleteOrgAs } from "@/lib/membership";`):

```ts
export async function deleteOrg(formData: FormData): Promise<void> {
  const me = await requireRoleOrRedirect("owner", "/settings/org");
  if (String(formData.get("confirm") || "").trim() !== me.orgName) return;
  await deleteOrgAs(supabaseAdmin(), me.orgId); // cascades everything
  clearDevbrainCookies(await cookies(), [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
  redirect("/welcome");
}
```

In `src/app/settings/tokens/actions.ts`, `revokeToken` (add `import { revokeTokenAs } from "@/lib/membership";`):

```ts
export async function revokeToken(formData: FormData): Promise<void> {
  const member = await currentMember();
  if (!member) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  await revokeTokenAs(supabaseAdmin(), member.userId, id, member.orgId); // your own, in the team you are looking at
  revalidatePath("/settings/tokens");
  revalidatePath("/desk", "layout");
}
```

- [ ] **Step 5: Run the tests, typecheck**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/membership.test.ts && npx vitest run && npm run typecheck`
Expected: membership 4 tests PASS; full suite green (the existing `pick-org.test.ts` mocks `@/lib/supabase/server` and still passes because `deleteOrg` is not exercised there — if any existing test now fails on a missing mock for `@/lib/membership`, add `vi.mock("@/lib/membership", () => ({ leaveOrgAs: async () => {}, deleteOrgAs: async () => {}, revokeTokenAs: async () => {} }))` to that test); typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/lib/membership.ts src/lib/__tests__/membership.test.ts src/app/settings && git commit -F - <<'EOF'
Membership: one lib for leave / delete team / revoke token, used by the Console actions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 3: The account actions

**Files:**
- Create: `src/app/account/actions.ts`
- Test: `src/lib/__tests__/account-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 (`DELETE_PHRASE`, `deletionPlan`, `canLeave`, `TeamStanding`), Task 2 (`leaveOrgAs`, `deleteOrgAs`, `revokeTokenAs`, `ownerCounts`, `memberCounts`, `teamBilling`), `currentUser()` + `supabaseAdmin()` + `supabaseServer()` from `@/lib/supabase/server`, `currentOrg()` from `@/lib/org`, `clearDevbrainCookies` + `COOKIE` from `@/lib/cookies`, `cookies` from `next/headers`, `redirect` from `next/navigation`, `revalidatePath` from `next/cache`.
- Produces: `leaveTeam(formData)`, `deleteTeam(formData)`, `revokeDevice(formData)`, `deleteAccount(prev, formData)`, `type AccountDeleteState = { ok: false; message: string; blockers?: Blocker[] } | null`, and `standingsFor(admin, orgs)` (exported for the page).

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/__tests__/account-actions.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

// The account actions with every neighbour stubbed. They must scope every
// change to the signed-in person, refuse what the rules refuse, and delete
// in the right order: the teams they are alone in, then the user, then out.
const jar = { set: vi.fn(), get: vi.fn(() => ({ value: "o1" })) };
vi.mock("next/headers", () => ({ cookies: async () => jar }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
const deleteUser = vi.fn(async (_id: string) => ({ data: {}, error: null as null | { message: string } }));
const signOut = vi.fn(async () => ({ error: null }));
const currentUser = vi.fn(async () => null as null | { id: string; email: string | null });
vi.mock("@/lib/supabase/server", () => ({
  currentUser: () => currentUser(),
  supabaseAdmin: () => ({ auth: { admin: { deleteUser: (id: string) => deleteUser(id) } } }),
  supabaseServer: async () => ({ auth: { signOut } }),
}));
const currentOrg = vi.fn(async () => null as null | { userId: string; orgId: string; orgName: string; role: string; orgs: { id: string; name: string; role: string }[] });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg() }));
const m = { leaveOrgAs: vi.fn(async () => {}), deleteOrgAs: vi.fn(async () => {}), revokeTokenAs: vi.fn(async () => {}), ownerCounts: vi.fn(async () => new Map<string, number>()), memberCounts: vi.fn(async () => new Map<string, number>()), teamBilling: vi.fn(async () => new Map<string, { billingStatus: string; hasSubscription: boolean }>()) };
vi.mock("@/lib/membership", () => m);

const { deleteAccount, deleteTeam, leaveTeam, revokeDevice } = await import("@/app/account/actions");
const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const me = { userId: "u1", orgId: "o1", orgName: "Alpha", role: "owner", orgs: [{ id: "o1", name: "Alpha", role: "owner" }, { id: "o2", name: "Beta", role: "member" }] };

describe("account actions", () => {
  beforeEach(() => { vi.clearAllMocks(); currentUser.mockResolvedValue({ id: "u1", email: "l@x.com" }); currentOrg.mockResolvedValue(me); m.ownerCounts.mockResolvedValue(new Map([["o1", 1], ["o2", 2]])); m.memberCounts.mockResolvedValue(new Map([["o1", 1], ["o2", 5]])); m.teamBilling.mockResolvedValue(new Map([["o1", { billingStatus: "trialing", hasSubscription: false }], ["o2", { billingStatus: "active", hasSubscription: true }]])); deleteUser.mockResolvedValue({ data: {}, error: null }); });

  it("signed out: every action is a silent no-op", async () => {
    currentUser.mockResolvedValue(null);
    await leaveTeam(fd({ orgId: "o2" })); await deleteTeam(fd({ orgId: "o1", confirm: "Alpha" })); await revokeDevice(fd({ id: "t1" }));
    expect(await deleteAccount(null, fd({ confirm: "delete my account" }))).toBeNull();
    expect(m.leaveOrgAs).not.toHaveBeenCalled(); expect(m.deleteOrgAs).not.toHaveBeenCalled(); expect(m.revokeTokenAs).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });

  it("leaveTeam leaves a team you are a member of and clears the cookie only if it was the active one", async () => {
    await leaveTeam(fd({ orgId: "o2" }));
    expect(m.leaveOrgAs).toHaveBeenCalledWith(expect.anything(), "u1", "o2");
    expect(jar.set).not.toHaveBeenCalled();
    await leaveTeam(fd({ orgId: "o1" })); // sole member → allowed, and it was the active team
    expect(jar.set.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["devbrain_org", "devbrain_last_repo"]));
  });

  it("leaveTeam refuses the only owner of a team with other members, and a team you are not in", async () => {
    m.memberCounts.mockResolvedValue(new Map([["o1", 4], ["o2", 5]]));
    await leaveTeam(fd({ orgId: "o1" }));
    await leaveTeam(fd({ orgId: "o9" }));
    expect(m.leaveOrgAs).not.toHaveBeenCalled();
  });

  it("deleteTeam needs ownership and the exact name", async () => {
    await deleteTeam(fd({ orgId: "o2", confirm: "Beta" })); // member, not owner
    await deleteTeam(fd({ orgId: "o1", confirm: "alpha" })); // wrong case
    expect(m.deleteOrgAs).not.toHaveBeenCalled();
    await deleteTeam(fd({ orgId: "o1", confirm: "Alpha" }));
    expect(m.deleteOrgAs).toHaveBeenCalledWith(expect.anything(), "o1");
  });

  it("revokeDevice revokes across teams, scoped to the person", async () => {
    await revokeDevice(fd({ id: "t1" }));
    expect(m.revokeTokenAs).toHaveBeenCalledWith(expect.anything(), "u1", "t1");
  });

  it("deleteAccount refuses the wrong phrase without touching anything", async () => {
    expect(await deleteAccount(null, fd({ confirm: "delete" }))).toMatchObject({ ok: false });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deleteAccount returns the blockers with nothing deleted", async () => {
    m.memberCounts.mockResolvedValue(new Map([["o1", 4], ["o2", 5]])); // sole owner of Alpha, others in it
    const r = await deleteAccount(null, fd({ confirm: "delete my account" }));
    expect(r).toMatchObject({ ok: false, blockers: [{ orgId: "o1", name: "Alpha", reason: "sole_owner_with_members" }] });
    expect(m.deleteOrgAs).not.toHaveBeenCalled(); expect(deleteUser).not.toHaveBeenCalled();
  });

  it("deleteAccount deletes the solo teams, then the user, signs out, clears cookies, and redirects", async () => {
    await expect(deleteAccount(null, fd({ confirm: "delete my account" }))).rejects.toThrow("REDIRECT:/?deleted=1");
    expect(m.deleteOrgAs).toHaveBeenCalledWith(expect.anything(), "o1");
    expect(m.leaveOrgAs).not.toHaveBeenCalled(); // membership of Beta cascades with the user row
    expect(deleteUser).toHaveBeenCalledWith("u1");
    expect(signOut).toHaveBeenCalled();
    expect(jar.set).toHaveBeenCalled();
    expect(m.deleteOrgAs.mock.invocationCallOrder[0]).toBeLessThan(deleteUser.mock.invocationCallOrder[0]);
  });

  it("deleteAccount with no team at all still deletes the user", async () => {
    currentOrg.mockResolvedValue(null);
    await expect(deleteAccount(null, fd({ confirm: "delete my account" }))).rejects.toThrow("REDIRECT:/?deleted=1");
    expect(deleteUser).toHaveBeenCalledWith("u1");
  });

  it("a failed deleteUser is reported, not thrown", async () => {
    deleteUser.mockResolvedValue({ data: {}, error: { message: "boom" } });
    expect(await deleteAccount(null, fd({ confirm: "delete my account" }))).toMatchObject({ ok: false, message: expect.stringContaining("team@getdevbrain.com") });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account-actions.test.ts`
Expected: FAIL — cannot resolve `@/app/account/actions`.

- [ ] **Step 3: Write the actions**

```ts
// src/app/account/actions.ts
"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canLeave, DELETE_PHRASE, deletionPlan, type Blocker, type TeamStanding } from "@/lib/account";
import { clearDevbrainCookies, COOKIE } from "@/lib/cookies";
import { LEGAL } from "@/lib/legal";
import { deleteOrgAs, leaveOrgAs, memberCounts, ownerCounts, revokeTokenAs, teamBilling } from "@/lib/membership";
import { currentOrg, type Role } from "@/lib/org";
import { currentUser, supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

// ============================================================================
// The website's account page — leave or delete a team, revoke a device,
// delete the account. Every action is scoped to the signed-in person and
// silently does nothing without a session. The rules live in
// src/lib/account.ts; the database changes in src/lib/membership.ts.
// ============================================================================

export type AccountDeleteState = { ok: false; message: string; blockers?: Blocker[] } | null;

const DELETE_FAILED = `Something went wrong deleting your account. Email ${LEGAL.contact} and we'll finish it by hand.`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = ReturnType<typeof supabaseAdmin>;

/** Everything the rules need to know about each of this person's teams. */
export async function standingsFor(admin: Admin, orgs: { id: string; name: string; role: Role }[]): Promise<TeamStanding[]> {
  const ids = orgs.map((o) => o.id);
  const [owners, members, billing] = await Promise.all([ownerCounts(admin, ids), memberCounts(admin, ids), teamBilling(admin, ids)]);
  return orgs.map((o) => ({
    orgId: o.id, name: o.name, role: o.role,
    ownerCount: owners.get(o.id) ?? 0, memberCount: members.get(o.id) ?? 0,
    billingStatus: billing.get(o.id)?.billingStatus ?? "trialing", hasSubscription: billing.get(o.id)?.hasSubscription ?? false,
  }));
}

async function forgetTeamCookiesIfActive(orgId: string) {
  const jar = await cookies();
  if (jar.get(COOKIE.org)?.value === orgId) clearDevbrainCookies(jar, [{ name: COOKIE.org, path: "/" }, { name: COOKIE.lastRepo, path: "/" }]);
}

export async function leaveTeam(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const ctx = await currentOrg();
  const orgId = String(formData.get("orgId") || "");
  const team = ctx?.orgs.find((o) => o.id === orgId);
  if (!ctx || !team) return;
  const admin = supabaseAdmin();
  const [standing] = await standingsFor(admin, [team]);
  if (!canLeave(standing)) return;
  await leaveOrgAs(admin, user.id, orgId);
  await forgetTeamCookiesIfActive(orgId);
  revalidatePath("/account");
}

export async function deleteTeam(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const ctx = await currentOrg();
  const orgId = String(formData.get("orgId") || "");
  const team = ctx?.orgs.find((o) => o.id === orgId);
  if (!ctx || !team || team.role !== "owner") return;
  if (String(formData.get("confirm") || "").trim() !== team.name) return;
  await deleteOrgAs(supabaseAdmin(), orgId);
  await forgetTeamCookiesIfActive(orgId);
  revalidatePath("/account");
}

export async function revokeDevice(formData: FormData): Promise<void> {
  const user = await currentUser();
  if (!user) return;
  const id = String(formData.get("id") || "");
  if (!id) return;
  await revokeTokenAs(supabaseAdmin(), user.id, id);
  revalidatePath("/account");
}

export async function deleteAccount(_prev: AccountDeleteState, formData: FormData): Promise<AccountDeleteState> {
  const user = await currentUser();
  if (!user) return null;
  if (String(formData.get("confirm") || "").trim().toLowerCase() !== DELETE_PHRASE) {
    return { ok: false, message: `Type "${DELETE_PHRASE}" to confirm.` };
  }
  const admin = supabaseAdmin();
  const ctx = await currentOrg();
  const plan = deletionPlan(ctx ? await standingsFor(admin, ctx.orgs) : []);
  if (!plan.ok) return { ok: false, message: "A team is in the way.", blockers: plan.blockers };

  // Teams this person is alone in go first; every other membership, token,
  // session, claim and device login cascades from the user row.
  for (const orgId of plan.deleteOrgIds) await deleteOrgAs(admin, orgId);
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) return { ok: false, message: DELETE_FAILED };

  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  clearDevbrainCookies(await cookies());
  redirect("/?deleted=1");
}
```

- [ ] **Step 4: Run the tests, typecheck**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account-actions.test.ts && npm run typecheck`
Expected: PASS, 10 tests; typecheck clean. If `admin.auth.admin.deleteUser` does not typecheck against the project's `supabaseAdmin()` return type, check how that client is constructed (`src/lib/supabase/server.ts`) — it is a service-role `createClient`, which exposes `auth.admin`; cast narrowly if needed and say so in the report.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/account/actions.ts src/lib/__tests__/account-actions.test.ts && git commit -F - <<'EOF'
Account: leave / delete team, revoke device, delete account — scoped to the signed-in person

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 4: Header with Support and the account state; root-page notice; browser allow-list

**Files:**
- Modify: `src/app/landing/landing.tsx` (`SiteHeader`, `Landing`)
- Modify: `src/lib/org.ts` (export `loginOf`)
- Modify: `src/app/page.tsx` (`deleted` notice, pass `account`)
- Modify: `src/app/support/page.tsx` (`current="support"`)
- Modify: `src/lib/app-only.ts` (`BROWSER_OK` + comment)
- Test: `src/lib/__tests__/site-copy.test.tsx` (replace the signed-in header test), `src/lib/__tests__/app-only.test.ts` (one line)

**Interfaces:**
- Produces: `SiteHeader({ current?: "faq" | "support" | "account"; account?: { login: string } | null })`; `Landing({ …, account })`; `loginOf(user: { email: string | null; user_metadata: Record<string, unknown> }): string`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/__tests__/site-copy.test.tsx`, replace the test titled `a signed-in visitor gets the landing page with a way into the app, not a redirect` with:

```tsx
  it("the header: FAQ · Support · Download when signed out; login → /account and Open the Console when signed in", () => {
    const out = renderToStaticMarkup(<SiteHeader />);
    expect(out).toMatch(/href="\/faq"[^>]*>FAQ/);
    expect(out).toMatch(/href="\/support"[^>]*>Support/);
    expect(out).toContain("Download for Mac");
    expect(out).not.toContain("/account");
    const on = renderToStaticMarkup(<SiteHeader current="support" />);
    expect(on).toMatch(/<span[^>]*>Support<\/span>/); // current page is not a link
    const signedIn = renderToStaticMarkup(<SiteHeader account={{ login: "lukeb230" }} />);
    expect(signedIn).toMatch(/href="\/account"[^>]*>lukeb230/);
    expect(signedIn).toMatch(/href="\/open"[^>]*>Open the Console/);
    expect(signedIn).not.toContain("Download for Mac");
    expect(signedIn.indexOf("Support")).toBeLessThan(signedIn.indexOf("lukeb230"));
  });
```

In `src/lib/__tests__/app-only.test.ts`, find the test that lists browser-ok paths (it asserts `browserRedirect(path, "Mozilla", true)` is `null` for `/faq`, `/open`, …) and add `"/account"` and `"/account/"` to that list. If the file has no such list, add:

```ts
  it("the account page works in a browser", () => {
    expect(browserRedirect("/account", "Mozilla/5.0", true)).toBeNull();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/site-copy.test.tsx src/lib/__tests__/app-only.test.ts`
Expected: site-copy FAIL (no Support link, no `account` prop). app-only may already pass because `browserRedirect` only gates `/desk` — that is fine; the `BROWSER_OK` entry is documentation of intent.

- [ ] **Step 3: `loginOf` in `src/lib/org.ts`**

Replace the two lines in `currentOrg` that compute `login` with a call to this new exported helper, placed above `currentOrg`:

```ts
/** The name we show for a person: GitHub login, else the email's local part. */
export function loginOf(user: { email: string | null; user_metadata: Record<string, unknown> }): string {
  const m = user.user_metadata ?? {};
  return String(m.user_name || m.preferred_username || user.email?.split("@")[0] || "member");
}
```
and in `currentOrg`: `const login = loginOf(user);` (delete the old `const m = …` and `const login = String(…)` lines).

- [ ] **Step 4: The header**

In `src/app/landing/landing.tsx`, replace the `SiteHeader` function (the whole thing, including its comment) with:

```tsx
// current: which nav item is the page itself (rendered as text, not a link).
// account: the signed-in person, when there is one — the header then offers
// their account page and the Console instead of a download they already
// have. The page underneath is the same either way; a signed-in visitor is
// never bounced off the site.
export function SiteHeader({ current, account = null }: { current?: "faq" | "support" | "account"; account?: { login: string } | null } = {}) {
  const item = (key: "faq" | "support", href: string, label: string) =>
    current === key ? <span key={key} className="text-txt">{label}</span> : <Link key={key} href={href} className="-my-2 py-2 hover:text-txt">{label}</Link>;
  return (
    <header className="sticky top-0 z-50 border-b border-line2 bg-[color:var(--wg-ink)]/70 backdrop-blur">
      <Section className="flex min-h-[58px] items-center gap-5">
        <Link href="/" aria-label="DevBrain home" className="-my-2 flex items-center gap-5 py-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brain.png" width={26} height={21} alt="" />
          <span className="font-display text-[17px] font-semibold tracking-[-.02em] text-txt">DevBrain</span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-[13.5px] text-muted">
          {item("faq", "/faq", "FAQ")}
          {item("support", "/support", "Support")}
          {account ? (
            <>
              {current === "account" ? <span className="font-mono text-[12.5px] text-txt">{account.login}</span> : <Link href="/account" className="-my-2 py-2 font-mono text-[12.5px] hover:text-txt">{account.login}</Link>}
              <Link href="/open" className="inline-flex items-center whitespace-nowrap rounded-lg bg-accent2 px-3.5 py-1.5 font-display text-[13px] font-semibold tracking-[-.01em] text-white hover:bg-[#b4453d]">Open the Console</Link>
            </>
          ) : (
            <DownloadButton size="nav" />
          )}
        </nav>
      </Section>
    </header>
  );
}
```

`Landing`: change its props from `signedIn?: boolean` to `account?: { login: string } | null` and pass `<SiteHeader account={account} />`.

- [ ] **Step 5: Root page and support page**

`src/app/page.tsx`:
- add `deleted?: string` to the `searchParams` type and destructure it;
- extend `notice`: when `deleted` is set (and no auth/device error), render `<p className="…same classes as the existing notice…">Your account is deleted. Thanks for trying DevBrain.</p>` — reuse the existing notice `<p>` classes verbatim;
- add `import { loginOf } from "@/lib/org";` and pass `account={user ? { login: loginOf(user) } : null}` to `<Landing …/>` in place of `signedIn={Boolean(user)}`.

`src/app/support/page.tsx`: `<SiteHeader current="support" account={user ? { login: loginOf(user) } : null} />` (import `loginOf`).

`src/lib/app-only.ts`: add `/^\/account(\/|$)/,` to `BROWSER_OK` after the `/open` entry and a line `//   /account         the website's account page (sign out, teams, devices, delete)` to the header comment.

- [ ] **Step 6: Run tests, typecheck**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/site-copy.test.tsx src/lib/__tests__/app-only.test.ts src/lib/__tests__/org-helpers.test.ts && npm run typecheck`
Expected: PASS; typecheck clean (the only other `signedIn` consumer was `Landing`).

- [ ] **Step 7: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/landing/landing.tsx src/lib/org.ts src/app/page.tsx src/app/support/page.tsx src/lib/app-only.ts src/lib/__tests__/site-copy.test.tsx src/lib/__tests__/app-only.test.ts && git commit -F - <<'EOF'
Site header: Support beside FAQ; a signed-in visitor sees their login and the Console

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 5: The `/account` page

**Files:**
- Create: `src/app/account/page.tsx`
- Create: `src/app/account/account-body.tsx`
- Create: `src/app/account/delete-account.tsx`
- Test: `src/lib/__tests__/account-body.test.tsx`

**Interfaces:**
- Consumes: Task 3's actions and `standingsFor`, `AccountDeleteState`; Task 1's `canLeave`, `leaveEmptiesTeam`, `blockerCopy`, `DELETE_PHRASE`; `switchOrg` from `@/app/settings/org/actions` (form fields `orgId`, `next`); `loadBilling(orgId)` → `{ plan: { name }, status, betaFree }`; `loginOf`; the site shell as in `/support`.
- Produces: `AccountBody(props: AccountProps)` (server component, exported), `AccountProps` type, `DeleteAccountForm()` (client).

- [ ] **Step 1: Write the failing test**

```tsx
// src/lib/__tests__/account-body.test.tsx
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccountBody, type AccountProps } from "@/app/account/account-body";

const props: AccountProps = {
  login: "lukeb230", email: "luke@example.com",
  teams: [
    { orgId: "o1", name: "Alpha", role: "owner", ownerCount: 1, memberCount: 1, billingStatus: "trialing", hasSubscription: false, plan: { name: "Free beta", status: "trialing", betaFree: true }, active: true },
    { orgId: "o2", name: "Beta", role: "owner", ownerCount: 1, memberCount: 4, billingStatus: "active", hasSubscription: true, plan: { name: "Scale", status: "active", betaFree: false }, active: false },
    { orgId: "o3", name: "Gamma", role: "member", ownerCount: 2, memberCount: 9, billingStatus: "active", hasSubscription: true, plan: null, active: false },
  ],
  devices: [{ id: "t1", label: "Luke's MacBook Pro", team: "Alpha", lastUsedAt: "2026-09-16T04:51:50Z" }],
};

describe("AccountBody", () => {
  const html = renderToStaticMarkup(<AccountBody {...props} />);
  it("shows who you are and a sign-out form that lands on the site", () => {
    expect(html).toContain("lukeb230");
    expect(html).toContain("luke@example.com");
    expect(html).toMatch(/<form[^>]*action="\/auth\/sign-out"[^>]*method="post"/);
    expect(html).not.toContain('name="from"');
  });
  it("lists every team with its role and the right controls", () => {
    // Alpha: sole member → Delete team (with the name confirm), no Leave.
    expect(html).toMatch(/Alpha[\s\S]*Delete team/);
    expect(html).toContain('placeholder="Alpha"');
    // Beta: sole owner with others → Leave disabled with the explanation; Delete team offered (owner).
    expect(html).toContain("only owner of Beta");
    // Gamma: plain member → Leave enabled, no Delete team, no plan line.
    expect(html).toMatch(/Gamma[\s\S]*Leave team/);
    expect((html.match(/Delete team/g) ?? []).length).toBe(2);
  });
  it("shows the plan for admins and links the plan page", () => {
    expect(html).toContain("Free beta");
    expect(html).toContain("Scale");
    expect(html).toMatch(/href="\/desk\/plan"/);
  });
  it("lists devices with a revoke form", () => {
    expect(html).toContain("Luke&#x27;s MacBook Pro");
    expect(html).toMatch(/name="id" value="t1"/);
    expect(html).toContain("Revoke");
  });
  it("offers the data-request pointer and the delete-account form", () => {
    expect(html).toMatch(/href="\/support"/);
    expect(html).toContain("delete my account");
    expect(html).toMatch(/name="confirm"/);
  });
  it("renders with no teams and no devices", () => {
    const empty = renderToStaticMarkup(<AccountBody {...props} teams={[]} devices={[]} />);
    expect(empty).toContain("You're not in a team yet");
    expect(empty).toContain("No devices");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account-body.test.tsx`
Expected: FAIL — cannot resolve `@/app/account/account-body`.

- [ ] **Step 3: The client delete form**

```tsx
// src/app/account/delete-account.tsx
"use client";

import { useActionState } from "react";
import { blockerCopy, DELETE_PHRASE } from "@/lib/account";
import { deleteAccount, type AccountDeleteState } from "./actions";

// The one part of the page that needs state: the delete form shows the
// rule that stopped it (a team you solely own, a paid plan) inline, with
// the phrase still typed, so fixing the blocker and retrying is one step.
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
```

- [ ] **Step 4: The body**

```tsx
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
          {/* returnTo() only accepts paths its ALLOWED pattern matches; if it rejects the query string, use "/open" here. */}
          <input type="hidden" name="next" value="/open?to=/desk" />
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
```

- [ ] **Step 5: The page**

```tsx
// src/app/account/page.tsx
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrowserShell } from "@/app/browser-shell";
import { siteDisplay } from "@/app/fonts";
import { SiteFooter, SiteHeader } from "@/app/landing/landing";
import { MotionGate, Mount } from "@/app/landing/reveal";
import { loadBilling } from "@/lib/billing/usage";
import { currentOrg, hasRole, loginOf } from "@/lib/org";
import { currentUser, supabaseAdmin } from "@/lib/supabase/server";
import { standingsFor } from "./actions";
import { AccountBody, type AccountTeam } from "./account-body";

export const metadata: Metadata = { title: "Account", description: "Your DevBrain account: teams, devices, sign out, delete." };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/?next=/account");
  const login = loginOf(user);
  const ctx = await currentOrg(); // null when they have no team yet
  const admin = supabaseAdmin();

  const standings = ctx ? await standingsFor(admin, ctx.orgs) : [];
  const teams: AccountTeam[] = await Promise.all(standings.map(async (s) => {
    const admin_ = hasRole(s.role, "admin");
    const b = admin_ ? await loadBilling(s.orgId) : null;
    return { ...s, active: ctx?.orgId === s.orgId, plan: b ? { name: b.plan.name, status: b.status, betaFree: b.betaFree } : null };
  }));

  const { data: tokens } = await admin
    .from("dev_tokens")
    .select("id, label, last_used_at, org_id, orgs(name)")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .is("parent_token_id", null)
    .order("last_used_at", { ascending: false, nullsFirst: false });
  const devices = (tokens ?? []).map((t) => ({ id: String(t.id), label: String(t.label), team: ((t.orgs as unknown as { name: string } | null)?.name) ?? "team", lastUsedAt: (t.last_used_at as string | null) ?? null }));

  return (
    <BrowserShell>
      <main className={`lp ${siteDisplay.variable} min-h-screen pb-24`}>
        <MotionGate />
        <SiteHeader current="account" account={{ login }} />
        <section className="mx-auto w-full max-w-[1140px] px-6 pt-14 sm:px-8 sm:pt-[70px]">
          <Mount as="h1" duration={700} y={24} className="max-w-[17ch] font-display text-[40px] font-semibold leading-[1.02] tracking-[-.03em] text-txt text-balance sm:text-[56px]">Your account.</Mount>
          <Mount as="p" delay={150} className="mt-4 max-w-[58ch] text-[16.5px] leading-[1.6] text-body">Everything about you that lives in DevBrain, and the way out. The work itself happens in the app.</Mount>
          <Mount delay={250} className="mt-12 max-w-[760px]"><AccountBody login={login} email={user.email} teams={teams} devices={devices} /></Mount>
        </section>
        <SiteFooter />
      </main>
    </BrowserShell>
  );
}
```

- [ ] **Step 6: Run the tests, typecheck, build**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/account-body.test.tsx && npm run typecheck && npx vitest run && npm run build`
Expected: 6 tests PASS; typecheck clean; full suite green; build lists `ƒ /account`. If `renderToStaticMarkup` of `AccountBody` complains about `DeleteAccountForm` (a client component with `useActionState`), it still renders on the server exactly as `SupportForm` does in `support-forms.test.tsx` — the same pattern is already proven.

- [ ] **Step 7: Look at it**

If `.env.local` exists: `npm run dev` in the background, sign in is not possible without a browser, so `curl -s http://localhost:3000/account -o /dev/null -w "%{http_code} %{redirect_url}\n"` must print `307 http://localhost:3000/?next=/account`. Stop the server. Record the line in the report.

- [ ] **Step 8: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/app/account src/lib/__tests__/account-body.test.tsx && git commit -F - <<'EOF'
Site: /account — you, your teams, your devices, your data, and the way out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 6: Privacy §9

**Files:**
- Modify: `src/content/legal/privacy.md` (§9 list)
- Test: `src/lib/__tests__/legal-doc.test.ts`

- [ ] **Step 1: Write the failing test**

Add to the first `describe` in `legal-doc.test.ts`:

```ts
  it("the privacy policy says you can delete your account from the website", () => {
    const privacy = legalMarkdown("privacy");
    expect(privacy).toContain("delete your account from the website's Account page");
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts`
Expected: FAIL on the new assertion.

- [ ] **Step 3: Edit the prose**

In §9 "Your controls and rights", the list that begins `- revoke any device token;`: change its intro line `At any time you can, from the app or the Console:` to `At any time you can, from the app, the Console, or the website's Account page:` and add, after the `- leave a team, or, as its owner, delete the team, which removes all of its data;` bullet:

```
- delete your account from the website's Account page, which removes your memberships, device tokens and sessions and deletes any team you were the only member of; support requests you sent keep their text without the link to your account;
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ~/Downloads/devbrain-product && npx vitest run src/lib/__tests__/legal-doc.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/Downloads/devbrain-product && git add src/content/legal/privacy.md src/lib/__tests__/legal-doc.test.ts && git commit -F - <<'EOF'
Privacy: account deletion from the website is a stated control

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```

---

### Task 7: Deploy and the live gate

**Files:** none new; results go into `docs/HANDOFF-2026-09-15.md` under a new "Account page" heading.

- [ ] **Step 1: Merge and push** (Luke pushes unless he says otherwise)

```bash
cd ~/Downloads/devbrain-product && git checkout main && git merge --ff-only feat/account-page && git log --oneline -1
```
Then `gh run list --branch main --limit 1` green and `gh api "repos/lukeb230/devbrain/deployments?environment=Production&per_page=1" --jq '.[0].sha[0:7]'` matches.

- [ ] **Step 2: Header, signed out and in**

`curl -s https://getdevbrain.com/ | grep -o 'href="/support"[^>]*>Support'` prints a match. In Luke's signed-in Chrome, the header shows his login and "Open the Console"; clicking the login opens `/account`.

- [ ] **Step 3: The throwaway account walk** (Luke drives; needs a second GitHub account)

1. Sign in with the throwaway → `/account` shows "You're not in a team yet".
2. Luke sends an invite from his test team; the throwaway joins → `/account` lists the team as member with Leave enabled and no Delete team.
3. Set up a Mac with that account (or mint a token via the Console) → Devices lists it; Revoke → it disappears; the Console's tokens page agrees.
4. Leave the team → gone from the list; Luke's Members page no longer shows them.
5. From `/welcome`, create a team → `/account` shows it as owner, "just you", with Delete team and no Leave.
6. Delete account with the phrase → lands on `/` with "Your account is deleted." In Supabase: `select count(*) from auth.users where id = '<id>'` → 0; the created org is gone; `org_members` has no rows for the id.
7. Blocker check, once: before step 6, invite Luke into the throwaway's team and try Delete account → the sole-owner blocker appears, nothing deleted; remove Luke, retry → succeeds.

- [ ] **Step 4: Record**

Append the outcomes (pass/fail per step) to the handoff and commit:

```bash
cd ~/Downloads/devbrain-product && git add docs/HANDOFF-2026-09-15.md && git commit -F - <<'EOF'
Docs: account page live-gate results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MJFUgZKpk9vG7LUE2k79sH
EOF
```
