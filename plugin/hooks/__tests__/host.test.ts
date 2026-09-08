import { describe, expect, it } from "vitest";
import { detectHost, editedFile, hostLabel, normalizeHost, relative, sessionKey, workdir } from "../host.mjs";

describe("detectHost", () => {
  it("prefers the --host flag, then the env, then the payload shape", () => {
    expect(detectHost(["node", "x.mjs", "--host=cursor"], {}, {})).toBe("cursor");
    expect(detectHost(["node", "x.mjs"], { DEVBRAIN_HOST: "codex" }, {})).toBe("codex");
    expect(detectHost(["node", "x.mjs"], {}, { conversation_id: "c", workspace_roots: ["/r"] })).toBe("cursor");
    expect(detectHost(["node", "x.mjs"], {}, { session_id: "s", tool_input: {} })).toBe("claude-code");
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
