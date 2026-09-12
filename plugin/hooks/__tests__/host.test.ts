import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectHost, editedFile, hostLabel, isEditTool, normalizeHost, relative, sessionKey, workdir } from "../host.mjs";

describe("detectHost", () => {
  it("prefers the --host flag, then the env, then the payload shape", () => {
    expect(detectHost(["node", "x.mjs", "--host=cursor"], {} as unknown as NodeJS.ProcessEnv, {})).toBe("cursor");
    expect(detectHost(["node", "x.mjs"], { DEVBRAIN_HOST: "codex" } as unknown as NodeJS.ProcessEnv, {})).toBe("codex");
    expect(detectHost(["node", "x.mjs"], {} as unknown as NodeJS.ProcessEnv, { conversation_id: "c", workspace_roots: ["/r"] })).toBe("cursor");
    expect(detectHost(["node", "x.mjs"], {} as unknown as NodeJS.ProcessEnv, { session_id: "s", tool_input: {} })).toBe("claude-code");
  });
  it("normalizes spellings and keeps unknowns as other", () => {
    expect(normalizeHost("Claude")).toBe("claude-code");
    expect(normalizeHost("codex-cli")).toBe("codex");
    expect(normalizeHost("windsurf")).toBe("other");
    expect(normalizeHost("")).toBe("claude-code");
    expect(hostLabel("cursor")).toBe("Cursor");
    expect(hostLabel("other")).toBe("agent");
  });
});

describe("payload normalization", () => {
  it("finds the edited file in Claude, Cursor and flat shapes", () => {
    expect(editedFile({ tool_input: { file_path: "/r/a.ts" } })).toBe("/r/a.ts");
    expect(editedFile({ file_path: "/r/b.ts", edits: [] })).toBe("/r/b.ts");
    expect(editedFile({ tool_input: { path: "/r/c.ts" } })).toBe("/r/c.ts");
    expect(editedFile({ tool_name: "Shell", tool_input: { command: "ls" } })).toBeNull();
    expect(editedFile({})).toBeNull();
  });
  it("only guards tools that change files", () => {
    expect(isEditTool({ tool_name: "Read", tool_input: { file_path: "/r/a.ts" } })).toBe(false);
    expect(isEditTool({ tool_name: "Grep" })).toBe(false);
    expect(isEditTool({ tool_name: "Shell" })).toBe(false);
    expect(isEditTool({ tool_name: "Write" })).toBe(true);
    expect(isEditTool({ tool_name: "StrReplace" })).toBe(true);
    expect(isEditTool({ tool_name: "MultiEdit" })).toBe(true);
    expect(isEditTool({ tool_name: "apply_patch" })).toBe(true);
    expect(isEditTool({})).toBe(true);
  });
  it("uses the agent's cwd or first workspace root, never a missing path", () => {
    expect(workdir({ cwd: "/definitely/not/here", workspace_roots: [process.cwd()] })).toBe(process.cwd());
    expect(workdir({})).toBe(process.cwd());
  });
  it("makes paths repo-relative and keys sessions by either id", () => {
    expect(relative("/r/src/a.ts", "/r")).toBe("src/a.ts");
    expect(relative("/elsewhere/a.ts", "/r")).toBe("/elsewhere/a.ts");
    expect(sessionKey({ conversation_id: "c1" })).toBe("c1");
    expect(sessionKey({ session_id: "s1", conversation_id: "c1" })).toBe("s1");
  });
});

describe("the plugin never assumes Node is on PATH", () => {
  it("routes every hook and the MCP server through node.sh", () => {
    const hooks = JSON.parse(readFileSync(new URL("../hooks.json", import.meta.url), "utf8")) as {
      hooks: Record<string, { hooks: { command: string }[] }[]>;
    };
    const commands = Object.values(hooks.hooks).flatMap((g) => g.flatMap((x) => x.hooks.map((h) => h.command)));
    expect(commands.length).toBeGreaterThan(4);
    for (const c of commands) {
      expect(c).toContain("hooks/node.sh");
      // A Mac with no Node installed is the normal case for a customer.
      expect(c).not.toMatch(/^node /);
    }
    const manifest = JSON.parse(readFileSync(new URL("../../.claude-plugin/plugin.json", import.meta.url), "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[] }>;
    };
    expect(manifest.mcpServers.devbrain.command).toBe("sh");
    expect(manifest.mcpServers.devbrain.args[0]).toContain("node.sh");
  });
});
