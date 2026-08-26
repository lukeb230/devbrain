// ============================================================================
// Journal extraction — PURE. Turns a Claude Code transcript (JSONL) into the
// redacted excerpt the SessionEnd hook posts to DevBrain.
//
// The privacy boundary, in code:
//   KEEP  the human's prompts, the assistant's prose, and tool NAMES with the
//         file path / command they targeted (first 120 chars).
//   DROP  every tool RESULT (file contents, command output, env files), all
//         "thinking" blocks, and subagent side-chains.
//   REDACT anything shaped like a secret before it leaves the Mac.
//   CAP   ~40 KB: the first 8 KB (what the task was) + the last 32 KB (how it
//         ended — where the conclusions live).
//
// Tested in plugin/hooks/__tests__/journal-extract.test.ts.
// ============================================================================

const HEAD_BYTES = 8_000;
const TAIL_BYTES = 32_000;

const SECRET_PATTERNS = [
  /\b(sk|rk)-[A-Za-z0-9_-]{16,}\b/g,                    // Anthropic / OpenAI / Stripe style
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,                    // GitHub tokens
  /\bsntry[su]_[A-Za-z0-9]{20,}\b/g,                    // Sentry
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,                   // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                              // AWS access key id
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/[^\s'"]+/gi,  // connection strings
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b([A-Z][A-Z0-9_]{2,}(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE)[A-Z0-9_]*)\s*[=:]\s*["']?[^\s"']{6,}/g, // KEY=value
  /\b(Bearer|Basic)\s+[A-Za-z0-9._\-+/=]{16,}/g,        // auth headers
];

export function redact(text) {
  let out = String(text);
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, (m, g1) =>
      // Keep the variable NAME for KEY=value so the journal can still say
      // "set SUPABASE_URL" — only the value is removed.
      /[=:]/.test(m) && g1 && /^[A-Z]/.test(g1) ? `${g1}=[redacted]` : "[redacted]",
    );
  }
  return out;
}

function toolLine(block) {
  const input = block.input ?? {};
  const target =
    input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.query ?? input.url ?? "";
  const t = String(target).replace(/\s+/g, " ").slice(0, 120);
  return `[tool] ${block.name}${t ? " " + t : ""}`;
}

/** Parse transcript JSONL into ordered lines: role-tagged prose + tool names. */
export function extractLines(jsonl) {
  const lines = [];
  for (const raw of String(jsonl).split("\n")) {
    if (!raw.trim()) continue;
    let o;
    try { o = JSON.parse(raw); } catch { continue; }
    if (o.isSidechain) continue;
    if (o.type !== "user" && o.type !== "assistant") continue;
    const content = o.message?.content;
    if (typeof content === "string") {
      if (o.type === "user" && content.trim()) lines.push(`[human] ${content.trim()}`);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (!b || typeof b !== "object") continue;
      if (b.type === "text" && typeof b.text === "string" && b.text.trim()) {
        // Hook/system injections arrive as user text wrapped in tags; skip
        // them so journals summarise the work, not the plumbing.
        if (o.type === "user" && /^<(system-reminder|command-|local-command|task-notification)/.test(b.text.trim())) continue;
        lines.push(`[${o.type === "user" ? "human" : "assistant"}] ${b.text.trim()}`);
      } else if (b.type === "tool_use" && b.name) {
        lines.push(toolLine(b));
      }
      // tool_result and thinking: dropped on purpose.
    }
  }
  return lines;
}

export function capExcerpt(text, head = HEAD_BYTES, tail = TAIL_BYTES) {
  if (text.length <= head + tail) return text;
  return text.slice(0, head) + "\n\n[… middle of session omitted …]\n\n" + text.slice(-tail);
}

/** Full pipeline: JSONL → redacted, capped excerpt string. */
export function buildExcerpt(jsonl) {
  const joined = extractLines(jsonl).join("\n");
  return capExcerpt(redact(joined));
}
