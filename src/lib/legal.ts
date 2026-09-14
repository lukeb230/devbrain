// Shared constants so the two legal pages, the site and the app agree on the
// facts. The legal documents themselves live in src/content/legal/*.md and
// reference these as {{tokens}}; change a value here and every page follows.
export const LEGAL = {
  product: "DevBrain",
  operator: "a sole proprietorship trading as DevBrain",
  // The host the site answers on today. Swap for the custom domain when it lands.
  domain: "devbrain-seven.vercel.app",
  // TODO(luke): replace with a mailbox before launch. Until then the public
  // issue tracker is the only channel, which is not suitable for deletion or
  // security requests; the documents say so.
  contact: "the DevBrain issue tracker at github.com/lukeb230/devbrain/issues",
  securityContact: "GitHub's private vulnerability reporting for the repository at github.com/lukeb230/devbrain/security/advisories",
  effective: "September 13, 2026",
  aiProvider: "Anthropic (the Claude API)",
  hosting: "Vercel",
  database: "Supabase",
  region: "the United States",
  law: "the State of California, United States",
  venue: "San Diego County, California",
  repo: "github.com/lukeb230/devbrain",
  // Referential use of another company's marks is generally permitted; implying
  // a relationship is not. This line is the disclaimer that keeps the "works
  // with" copy honest. Never pair it with their logos.
  trademarks:
    "Claude and Claude Code are trademarks of Anthropic. Cursor is a trademark of Anysphere. Codex and GitHub are trademarks of OpenAI and GitHub, Inc. DevBrain is not affiliated with, endorsed by, or sponsored by any of them.",
} as const;
