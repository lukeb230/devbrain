import { describe, expect, it } from "vitest";
import { buildExcerpt, capExcerpt, extractLines, redact } from "../journal-extract.mjs";

const line = (o: unknown) => JSON.stringify(o);
const user = (content: unknown, extra = {}) => line({ type: "user", message: { role: "user", content }, ...extra });
const asst = (content: unknown, extra = {}) => line({ type: "assistant", message: { role: "assistant", content }, ...extra });

describe("extractLines — the privacy boundary", () => {
  it("keeps prompts, assistant prose and tool names; drops tool results and thinking", () => {
    const jsonl = [
      user("Fix the export bug"),
      asst([
        { type: "thinking", thinking: "secret internal reasoning" },
        { type: "text", text: "Looking at the export module." },
        { type: "tool_use", name: "Read", input: { file_path: "/Users/x/app/src/export.ts" } },
      ]),
      user([{ type: "tool_result", content: "const KEY = 'sk-abcdefghijklmnopqrstuvwxyz'; // file contents" }]),
      asst([{ type: "text", text: "Found it — the date parser." }]),
    ].join("\n");
    const lines = extractLines(jsonl);
    expect(lines).toEqual([
      "[human] Fix the export bug",
      "[assistant] Looking at the export module.",
      "[tool] Read /Users/x/app/src/export.ts",
      "[assistant] Found it — the date parser.",
    ]);
    expect(lines.join("\n")).not.toContain("secret internal");
    expect(lines.join("\n")).not.toContain("file contents");
  });

  it("skips subagent side-chains, hook injections, and non-message rows", () => {
    const jsonl = [
      line({ type: "attachment", attachment: {} }),
      line({ type: "system", message: { content: "x" } }),
      asst([{ type: "text", text: "sidechain work" }], { isSidechain: true }),
      user([{ type: "text", text: "<system-reminder>injected</system-reminder>" }]),
      user("real prompt"),
      "not json at all",
    ].join("\n");
    expect(extractLines(jsonl)).toEqual(["[human] real prompt"]);
  });

  it("summarises a tool call by its first useful input, truncated", () => {
    const long = "x".repeat(500);
    const [l] = extractLines(asst([{ type: "tool_use", name: "Bash", input: { command: long } }]));
    expect(l.startsWith("[tool] Bash xxxx")).toBe(true);
    expect(l.length).toBeLessThan(140);
  });
});

describe("redact", () => {
  it("removes tokens, JWTs, connection strings and private keys", () => {
    const s = [
      "key sk-abcdefghijklmnopqrstuvwxyz123456",
      "gh ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
      "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      "db postgres://user:pass@host:5432/db",
      "-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----",
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
    ].join("\n");
    const r = redact(s);
    expect(r).not.toMatch(/sk-abc|ghp_|eyJ|postgres:\/\/|MIIE|abcdefghijklmnopqrstuvwxyz$/m);
    expect((r.match(/\[redacted\]/g) ?? []).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps the variable name for KEY=value pairs so the journal stays useful", () => {
    expect(redact("set SUPABASE_SERVICE_ROLE_KEY=abcdef123456 in Vercel")).toBe(
      "set SUPABASE_SERVICE_ROLE_KEY=[redacted] in Vercel",
    );
    expect(redact("DEVBRAIN_CRON_SECRET: 'supersecretvalue'")).toContain("DEVBRAIN_CRON_SECRET=[redacted]");
  });

  it("leaves ordinary code and paths alone", () => {
    const s = "edited src/lib/token.ts — hashToken uses sha256; see https://docs.example.com/x";
    expect(redact(s)).toBe(s);
  });
});

describe("capExcerpt / buildExcerpt", () => {
  it("keeps the head and the tail of a long session", () => {
    const text = "A".repeat(100) + "B".repeat(100_000) + "Z".repeat(100);
    const c = capExcerpt(text, 50, 60);
    expect(c.startsWith("A".repeat(50))).toBe(true);
    expect(c.endsWith("Z".repeat(60))).toBe(true);
    expect(c).toContain("omitted");
  });

  it("end to end: prose survives, secrets in prose are redacted", () => {
    const out = buildExcerpt(asst([{ type: "text", text: "Set ANTHROPIC_API_KEY=sk-live12345678901234567890 in Vercel." }]));
    expect(out).toBe("[assistant] Set ANTHROPIC_API_KEY=[redacted] in Vercel.");
  });
});
