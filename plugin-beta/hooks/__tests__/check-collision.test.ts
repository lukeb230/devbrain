import http from "node:http";
import { execSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ============================================================================
// The PreToolUse guard's contract with POST /api/v1/guard, exercised through
// the REAL hook script against a mock of the route. No database: the
// decision itself is tested in src/lib/__tests__/guard.test.ts. This proves
// what the hook sends (repo, rel, session_id, host, record) and what it
// emits per host — including the Cursor path where a silently-allowed retry
// must tell the server NOT to record a second warning.
// ============================================================================

const HOOKS = join(__dirname, "..");
const HOOK = join(HOOKS, "check-collision.mjs");

type Seen = { url: string | undefined; auth: string | undefined; body: Record<string, unknown> };

describe("check-collision.mjs ⇄ /api/v1/guard", () => {
  let server: http.Server;
  let port = 0;
  let home = "";
  let repoDir = "";
  const seen: Seen[] = [];

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let raw = "";
      req.on("data", (d) => (raw += d));
      req.on("end", () => {
        const body = JSON.parse(raw || "{}");
        seen.push({ url: req.url, auth: req.headers.authorization, body });
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ warn: true, reason: `DevBrain: ${body.rel} is being worked on right now by Nova (claimed: t). Editing it anyway risks a collision — coordinate first, or approve to proceed deliberately.`, with: [{ label: "Nova", via: "claim", id: "c1" }] }));
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    port = (server.address() as { port: number }).port;

    home = mkdtempSync(join(os.tmpdir(), "devbrain-guard-home-"));
    writeFileSync(join(home, "config.json"), JSON.stringify({ server: `http://127.0.0.1:${port}`, token: "tok_test" }));

    // A throwaway repo with a GitHub origin: the hook derives owner/name from it.
    // realpath: macOS tmp dirs are symlinks (/var → /private/var) and git reports
    // the resolved toplevel, which the hook prefix-strips from the edited path.
    repoDir = realpathSync(mkdtempSync(join(os.tmpdir(), "devbrain-guard-repo-")));
    execSync("git init -q && git remote add origin https://github.com/acme/demo.git", { cwd: repoDir });
    mkdirSync(join(repoDir, "src"), { recursive: true });
  });

  afterAll(() => {
    server.close();
    rmSync(home, { recursive: true, force: true });
    rmSync(repoDir, { recursive: true, force: true });
  });

  const input = () => JSON.stringify({ session_id: "contract-convo", cwd: repoDir, tool_name: "Edit", tool_input: { file_path: join(repoDir, "src/a.ts") } });
  const run = (args: string[] = []) =>
    new Promise<{ stdout: string; status: number | null }>((resolve) => {
      const p = spawn("node", [HOOK, ...args], { env: { ...process.env, DEVBRAIN_HOME: home } });
      let stdout = "";
      p.stdout.on("data", (d) => (stdout += d));
      p.on("close", (status) => resolve({ stdout, status }));
      p.stdin.end(input());
    });

  it("claude-code: one POST with the token and every field, record:true, emits ask with the server's reason", async () => {
    const r = await run();
    const s = seen.at(-1)!;
    expect(s.url).toBe("/api/v1/guard");
    expect(s.auth).toBe("Bearer tok_test");
    expect(s.body).toMatchObject({ repo: "acme/demo", rel: "src/a.ts", host: "claude-code", record: true });
    expect(r.stdout).toMatch(/"permissionDecision":"ask"/);
    expect(r.stdout).toMatch(/coordinate first/);
    expect(r.status).toBe(0);
  });

  it("cursor, first attempt: record:true and a deny", async () => {
    const r = await run(["--host=cursor"]);
    expect(seen.at(-1)!.body).toMatchObject({ host: "cursor", record: true });
    expect(r.stdout).toMatch(/"permission":"deny"/);
  });

  it("cursor, after the person replied: record:false and silence (the edit is allowed)", async () => {
    // The person spoke after the denial → the sticky state allows the next attempt.
    const host = await import(join(HOOKS, "host.mjs"));
    const prev = process.env.DEVBRAIN_HOME;
    process.env.DEVBRAIN_HOME = home;
    mkdirSync(join(home, "prompts"), { recursive: true });
    writeFileSync(host.promptStamp(host.sessionKey(JSON.parse(input()))), String(Date.now() + 1000));
    process.env.DEVBRAIN_HOME = prev;

    const r = await run(["--host=cursor"]);
    expect(seen.at(-1)!.body).toMatchObject({ host: "cursor", record: false });
    expect(r.stdout.trim()).toBe("");
  });

  it("server unreachable: silent, exit 0 — the guard fails open", async () => {
    await new Promise<void>((r) => server.close(() => r()));
    const r = await run();
    expect(r.stdout.trim()).toBe("");
    expect(r.status).toBe(0);
  });
});
