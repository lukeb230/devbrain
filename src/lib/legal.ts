// Shared constants so the two legal pages and the app agree on the facts.
export const LEGAL = {
  product: "DevBrain",
  operator: "the DevBrain maintainers",
  contact: "the project's GitHub issues page (github.com/lukeb230/devbrain)",
  effective: "August 30, 2026",
  aiProvider: "Anthropic (the Claude API)",
  // Referential use of another company's marks is generally permitted; implying
  // a relationship is not. This line is the disclaimer that keeps the "works
  // with" copy honest. Never pair it with their logos.
  trademarks:
    "Claude and Claude Code are trademarks of Anthropic. Cursor is a trademark of Anysphere. Codex and GitHub are trademarks of OpenAI and GitHub, Inc. DevBrain is not affiliated with, endorsed by, or sponsored by any of them.",
} as const;
