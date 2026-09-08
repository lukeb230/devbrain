import { describe, expect, it } from "vitest";
import {
  hookCommands, mergeCursorHooks, stripCursorHooks, mergeCursorMcp, stripMcpJson,
  mergeCodexConfig, stripCodexConfig, mergeCodexHooks, stripCodexHooks, mergeAgentsMd, splitToml,
} from "../hosts.mjs";

const node = "/Users/x/.devbrain-beta/bin/node";
const hooksDir = "/Users/x/.devbrain-beta/src/plugin-beta/hooks";
const serverPath = "/Users/x/.devbrain-beta/src/plugin-beta/mcp/server.mjs";
const home = "/Users/x/.devbrain-beta";

describe("hookCommands", () => {
  it("quotes paths and tags the host", () => {
    const c = hookCommands({ node, hooksDir, host: "cursor" });
    expect(c.sessionStart).toBe(`'${node}' '${hooksDir}/presence.mjs' session_start --host=cursor`);
    expect(c.guard).toContain("check-collision.mjs' --host=cursor");
  });
  it("escapes single quotes in paths", () => {
    const c = hookCommands({ node: "/Users/o'brien/node", hooksDir, host: "codex" });
    expect(c.activity.startsWith(`'/Users/o'\\''brien/node'`)).toBe(true);
  });
});

describe("Cursor hooks.json", () => {
  const existing = {
    version: 1,
    hooks: { preToolUse: [{ command: "node '/Users/x/.cursor/skills/impeccable/scripts/hook-before-edit.mjs'", timeout: 5 }] },
  };
  it("keeps other people's hooks and appends ours", () => {
    const out = mergeCursorHooks(existing, { node, hooksDir });
    expect(out.hooks.preToolUse).toHaveLength(2);
    expect(out.hooks.preToolUse[0].command).toContain("impeccable");
    expect(out.hooks.preToolUse[1].command).toContain("check-collision.mjs");
    expect(out.hooks.sessionStart[0].command).toContain("session_start --host=cursor");
    expect(out.hooks.afterFileEdit[0].command).toContain("activity --host=cursor");
    expect(out.hooks.sessionEnd).toHaveLength(1);
    expect(existing.hooks.preToolUse).toHaveLength(1); // input untouched
  });
  it("is idempotent", () => {
    const once = mergeCursorHooks(existing, { node, hooksDir });
    const twice = mergeCursorHooks(once, { node, hooksDir });
    expect(twice).toEqual(once);
  });
  it("replaces an older install path of ours but not a different channel's", () => {
    const stable = mergeCursorHooks(existing, { node: "/Users/x/.devbrain/bin/node", hooksDir: "/Users/x/.devbrain/src/plugin/hooks" });
    const both = mergeCursorHooks(stable, { node, hooksDir });
    expect(both.hooks.sessionStart).toHaveLength(2); // stable + beta coexist
  });
  it("strips only ours", () => {
    const out = stripCursorHooks(mergeCursorHooks(existing, { node, hooksDir }), hooksDir);
    expect(out).toEqual(existing);
  });
  it("starts from nothing", () => {
    const out = mergeCursorHooks(undefined, { node, hooksDir });
    expect(out.version).toBe(1);
    expect(Object.keys(out.hooks).sort()).toEqual(["afterFileEdit", "beforeSubmitPrompt", "preToolUse", "sessionEnd", "sessionStart", "stop"]);
    expect(out.hooks.stop[0].command).toContain("presence.mjs' touch --host=cursor");
  });
});

describe("Cursor mcp.json", () => {
  it("adds our server beside others", () => {
    const out = mergeCursorMcp({ mcpServers: { other: { command: "x" } } }, { id: "devbrain-beta", node, serverPath, home });
    expect(Object.keys(out.mcpServers)).toEqual(["other", "devbrain-beta"]);
    expect(out.mcpServers["devbrain-beta"].env.DEVBRAIN_CWD).toBe("${workspaceFolder}");
    expect(out.mcpServers["devbrain-beta"].env.DEVBRAIN_HOST).toBe("cursor");
    expect(stripMcpJson(out, "devbrain-beta")).toEqual({ mcpServers: { other: { command: "x" } } });
  });
});

describe("Codex config.toml", () => {
  const base = `model = "gpt-5"
approval_policy = "on-request"

[features]
some_flag = false

[mcp_servers.context7]
command = "npx"
args = ["-y", "@upstash/context7-mcp"]
`;
  it("appends our table and turns hooks on without touching the rest", () => {
    const out = mergeCodexConfig(base, { id: "devbrain-beta", node, serverPath, home });
    expect(out).toContain('model = "gpt-5"');
    expect(out).toContain("[mcp_servers.context7]");
    expect(out).toContain("[features]\nsome_flag = false\nhooks = true");
    expect(out).toContain(`[mcp_servers.devbrain-beta]\ncommand = ${JSON.stringify(node)}`);
    expect(out).toContain(`[mcp_servers.devbrain-beta.env]\nDEVBRAIN_HOME = ${JSON.stringify(home)}`);
    expect(out).toContain('DEVBRAIN_PRESENCE = "lifecycle"');
  });
  it("is idempotent and flips an existing hooks = false", () => {
    const once = mergeCodexConfig(base.replace("some_flag = false", "some_flag = false\nhooks = false"), { id: "devbrain-beta", node, serverPath, home });
    expect(once).not.toContain("hooks = false");
    expect(once.match(/hooks = true/g)).toHaveLength(1);
    const twice = mergeCodexConfig(once, { id: "devbrain-beta", node, serverPath, home });
    expect(twice).toBe(once);
  });
  it("works on an empty or missing file", () => {
    const out = mergeCodexConfig("", { id: "devbrain", node, serverPath, home });
    expect(out.startsWith("[features]\nhooks = true\n")).toBe(true);
    expect(splitToml(out).map((p) => p.header)).toEqual([null, "features", "mcp_servers.devbrain", "mcp_servers.devbrain.env"]);
  });
  it("strips our tables and only ours", () => {
    const out = stripCodexConfig(mergeCodexConfig(base, { id: "devbrain-beta", node, serverPath, home }), "devbrain-beta");
    expect(out).not.toContain("devbrain-beta");
    expect(out).toContain("[mcp_servers.context7]");
    expect(out).toContain("hooks = true"); // the feature flag stays; other hooks may rely on it
  });
});

describe("Codex hooks.json", () => {
  it("merges Claude-shaped groups and strips cleanly", () => {
    const existing = { hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } };
    const out = mergeCodexHooks(existing, { node, hooksDir });
    expect(out.hooks.PreToolUse).toHaveLength(2);
    expect(out.hooks.SessionStart[0].hooks[0].command).toContain("session_start --host=codex");
    expect(mergeCodexHooks(out, { node, hooksDir })).toEqual(out);
    expect(stripCodexHooks(out, hooksDir)).toEqual(existing);
  });
});

describe("AGENTS.md", () => {
  it("appends once and replaces in place", () => {
    const a = mergeAgentsMd("# Relay\nSome rules.\n");
    expect(a.startsWith("# Relay\nSome rules.\n\n<!-- devbrain:start -->")).toBe(true);
    const b = mergeAgentsMd(a.replace("Record non-obvious", "OLD TEXT"));
    expect(b).toBe(a);
    expect(mergeAgentsMd("").startsWith("<!-- devbrain:start -->")).toBe(true);
  });
});
