import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Report } from "@/lib/reports";

// The Resend client is a spy: these tests pin what we SEND (two mails, who
// they go to, who a reply reaches) and that a provider failure becomes a
// value, never a throw. No network.
type SendResult = { data: { id: string } | null; error: { message: string; name: string } | null };
const send = vi.fn(async (_args: Record<string, unknown>): Promise<SendResult> => ({ data: { id: "m_1" }, error: null }));
let throwOnConstruct: Error | null = null;
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
    constructor(public key: string) {
      if (throwOnConstruct) throw throwOnConstruct;
    }
  },
}));

const { sendReportMail, SUPPORT_FROM } = await import("@/lib/support-mail");

const report: Report = { kind: "bug", source: "console", email: "nova@example.com", name: "Nova", subject: "Panel is blank", message: "After the update the panel shows nothing at all, even after a reload.", context: { app_version: "0.4.12", team: "Northwind" } };

describe("sendReportMail", () => {
  beforeEach(() => { send.mockClear(); send.mockResolvedValue({ data: { id: "m_1" }, error: null }); process.env.RESEND_API_KEY = "re_test"; throwOnConstruct = null; });

  it("sends the operator copy (reply-to the submitter) and the ack (reply-to us)", async () => {
    expect(await sendReportMail(report, 1042)).toEqual({ status: "sent" });
    expect(send).toHaveBeenCalledTimes(2);
    const calls = send.mock.calls.map((c) => c[0]);
    const ops = calls.find((c) => c.subject === "[DB-1042] Bug: Panel is blank")!;
    const ack = calls.find((c) => c.subject === "[DB-1042] We got your report")!;
    expect(ops).toMatchObject({ from: SUPPORT_FROM, to: ["team@getdevbrain.com"], replyTo: "nova@example.com" });
    expect(String(ops.text)).toContain("app_version: 0.4.12");
    expect(ack).toMatchObject({ from: SUPPORT_FROM, to: ["nova@example.com"], replyTo: "team@getdevbrain.com" });
    expect(String(ack.text)).toContain("DB-1042");
    expect(SUPPORT_FROM).toBe("DevBrain <team@getdevbrain.com>");
  });

  it("a provider error on either mail is a failed result with the message", async () => {
    send.mockResolvedValueOnce({ data: null, error: { message: "Domain not verified", name: "validation_error" } });
    expect(await sendReportMail(report, 1)).toEqual({ status: "failed", error: "Domain not verified" });
  });

  it("a thrown send is a failed result, not an exception", async () => {
    send.mockRejectedValueOnce(new Error("ECONNRESET"));
    expect(await sendReportMail(report, 2)).toEqual({ status: "failed", error: "ECONNRESET" });
  });

  it("a throwing SDK constructor is a failed result, not an exception", async () => {
    throwOnConstruct = new Error("bad init");
    expect(await sendReportMail(report, 5)).toEqual({ status: "failed", error: "bad init" });
    expect(send).not.toHaveBeenCalled();
  });

  it("no key means failed with a clear reason and no send attempted", async () => {
    delete process.env.RESEND_API_KEY;
    expect(await sendReportMail(report, 3)).toEqual({ status: "failed", error: "RESEND_API_KEY unset" });
    expect(send).not.toHaveBeenCalled();
  });

  it("a send that never resolves times out into failed", async () => {
    vi.useFakeTimers();
    send.mockReturnValueOnce(new Promise<SendResult>(() => {}));
    const p = sendReportMail(report, 4);
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toEqual({ status: "failed", error: "send timed out" });
    vi.useRealTimers();
  });
});
