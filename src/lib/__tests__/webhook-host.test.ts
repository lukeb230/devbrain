import { describe, expect, it } from "vitest";
import { isAllowedWebhookHost } from "@/lib/webhook-host";

describe("isAllowedWebhookHost", () => {
  it("allows Slack and Discord over https", () => {
    expect(isAllowedWebhookHost("https://hooks.slack.com/services/T/B/x")).toBe(true);
    expect(isAllowedWebhookHost("https://discord.com/api/webhooks/1/x")).toBe(true);
    expect(isAllowedWebhookHost("https://discordapp.com/api/webhooks/1/x")).toBe(true);
  });
  it("blocks the SSRF classics", () => {
    expect(isAllowedWebhookHost("https://169.254.169.254/latest/meta-data")).toBe(false);
    expect(isAllowedWebhookHost("http://hooks.slack.com/x")).toBe(false); // not https
    expect(isAllowedWebhookHost("https://localhost/x")).toBe(false);
    expect(isAllowedWebhookHost("https://hooks.slack.com.evil.com/x")).toBe(false);
    expect(isAllowedWebhookHost("https://user:pass@hooks.slack.com/x")).toBe(false);
    expect(isAllowedWebhookHost("not a url")).toBe(false);
  });
});
