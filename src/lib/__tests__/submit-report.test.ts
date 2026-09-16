import { beforeEach, describe, expect, it, vi } from "vitest";

// submitReport with every neighbour stubbed: it must drop bots and floods
// silently, name a bad field, store before mailing, and turn a mail failure
// into a row stamp + ops alert while the person still gets a reference.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }) }));
const publicLimit = vi.fn(async (_ip: string, _what: string): Promise<unknown> => null);
vi.mock("@/lib/api-guard", () => ({ publicLimit: (ip: string, what: string) => publicLimit(ip, what) }));
const alert = vi.fn(async (_i: unknown) => {});
const resolve = vi.fn(async (_s: unknown, _k: string) => {});
vi.mock("@/lib/alerts", () => ({ alert: (i: unknown) => alert(i as never), resolve: (s: unknown, k: string) => resolve(s as never, k as never) }));
const sendReportMail = vi.fn(async (_r: unknown, _ref: number) => ({ status: "sent" as const }));
vi.mock("@/lib/support-mail", () => ({ sendReportMail: (r: unknown, ref: number) => sendReportMail(r as never, ref as never) }));
const currentUser = vi.fn(async () => null as null | { id: string; email: string | null });
const inserted: Record<string, unknown>[] = [];
const updated: { patch: Record<string, unknown>; ref: number }[] = [];
let insertError: null | { code: string } = null;
vi.mock("@/lib/supabase/server", () => ({
  currentUser: () => currentUser(),
  supabaseAdmin: () => ({
    from: (t: string) => ({
      insert: (row: Record<string, unknown>) => ({ select: () => ({ single: async () => { inserted.push({ table: t, ...row }); return insertError ? { data: null, error: insertError } : { data: { ref: 1042 }, error: null }; } }) }),
      update: (patch: Record<string, unknown>) => ({ eq: async (_c: string, ref: number) => { updated.push({ patch, ref }); return { error: null }; } }),
    }),
  }),
}));
const currentOrg = vi.fn(async () => null as null | { orgId: string; orgName: string });
vi.mock("@/lib/org", () => ({ currentOrg: () => currentOrg() }));

const { submitReport } = await import("@/app/support/actions");

const fd = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ kind: "bug", source: "web", email: "nova@example.com", subject: "Panel is blank", message: "After the update the panel shows nothing at all, even after a reload.", ...over })) f.set(k, v);
  return f;
};

describe("submitReport", () => {
  beforeEach(() => { inserted.length = 0; updated.length = 0; insertError = null; publicLimit.mockClear(); publicLimit.mockResolvedValue(null); alert.mockClear(); resolve.mockClear(); sendReportMail.mockClear(); sendReportMail.mockResolvedValue({ status: "sent" }); currentUser.mockResolvedValue(null); currentOrg.mockResolvedValue(null); });

  it("stores, mails, resolves the ops alert, and returns the reference", async () => {
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "DB-1042" });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ table: "reports", kind: "bug", source: "web", email: "nova@example.com", user_id: null, org_id: null, mail_status: "pending" });
    expect(sendReportMail).toHaveBeenCalledWith(expect.objectContaining({ kind: "bug" }), 1042);
    expect(updated).toEqual([{ patch: { mail_status: "sent" }, ref: 1042 }]);
    expect(resolve).toHaveBeenCalledWith("ops", "support_mail");
    expect(alert).not.toHaveBeenCalled();
  });

  it("a filled honeypot or a flooding IP gets a thank-you with no reference and writes nothing", async () => {
    expect(await submitReport(null, fd({ website: "http://spam" }))).toEqual({ ok: true, ref: "" });
    publicLimit.mockResolvedValueOnce({ status: 429 });
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "" });
    expect(inserted).toHaveLength(0);
    expect(sendReportMail).not.toHaveBeenCalled();
    expect(publicLimit).toHaveBeenCalledWith("203.0.113.9", "report");
  });

  it("names a bad field and writes nothing", async () => {
    expect(await submitReport(null, fd({ message: "short" }))).toMatchObject({ ok: false });
    expect(await submitReport(null, fd({ kind: "support", source: "console" }))).toMatchObject({ ok: false });
    expect(inserted).toHaveLength(0);
  });

  it("signed in: the account's email wins over the form, and the team is attached", async () => {
    currentUser.mockResolvedValue({ id: "u1", email: "luke@example.com" });
    currentOrg.mockResolvedValue({ orgId: "o1", orgName: "Northwind" });
    expect(await submitReport(null, fd({ email: "someone@else.com", source: "console", context: JSON.stringify({ app_version: "0.4.12" }) }))).toEqual({ ok: true, ref: "DB-1042" });
    expect(inserted[0]).toMatchObject({ email: "luke@example.com", user_id: "u1", org_id: "o1", context: { app_version: "0.4.12", team: "Northwind" } });
  });

  it("signed out claiming source=console is refused, writing nothing", async () => {
    expect(await submitReport(null, fd({ source: "console" }))).toEqual({ ok: false, message: "Pick what this is about." });
    expect(inserted).toHaveLength(0);
  });

  it("signed out: a client-supplied team in context is dropped", async () => {
    expect(await submitReport(null, fd({ context: JSON.stringify({ team: "Forged", app_version: "9.9.9" }) }))).toEqual({ ok: true, ref: "DB-1042" });
    expect(inserted[0].context).toEqual({ app_version: "9.9.9" });
  });

  it("insert failure: an error, nothing mailed", async () => {
    insertError = { code: "XX000" };
    expect(await submitReport(null, fd())).toEqual({ ok: false, message: "Something went wrong saving that. Try again in a moment." });
    expect(sendReportMail).not.toHaveBeenCalled();
  });

  it("mail failure: row stamped failed, ops alert raised, person still gets the reference", async () => {
    sendReportMail.mockResolvedValueOnce({ status: "failed", error: "Domain not verified" } as never);
    expect(await submitReport(null, fd())).toEqual({ ok: true, ref: "DB-1042" });
    expect(updated).toEqual([{ patch: { mail_status: "failed", mail_error: "Domain not verified" }, ref: 1042 }]);
    expect(alert).toHaveBeenCalledWith(expect.objectContaining({ scope: "ops", key: "support_mail", title: "Support mail is not going out" }));
    expect(resolve).not.toHaveBeenCalled();
  });
});
