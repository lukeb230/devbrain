// The eleven FAQ questions, in artboard order (left column then right column).
// Every answer paragraph is transcribed verbatim from
// docs/site-handoff/FAQ.artboard.html: do not paraphrase or "clean up" the
// wording here without going back to that source.

export const FAQ_ITEMS: { q: string; a: React.ReactNode[] }[] = [
  {
    q: "Does it see my code?",
    a: [
      <>It doesn&apos;t store any. What DevBrain keeps is metadata: who&apos;s active, which files were touched, task and PR records, and short redacted session summaries. Never file contents, never command output.</>,
      <>Two things do leave your machine briefly: a PR&apos;s diff, when DevBrain reviews it, and a redacted excerpt of a session, when it writes a journal. Both go to the AI provider for that one job and aren&apos;t kept afterwards. The <a href="/privacy" className="text-accenttext hover:underline">privacy page</a> lists every field.</>,
    ],
  },
  {
    q: "Does it write to my repos?",
    a: [
      <>Not unless an admin turns it on, per repo. There are three writes it can do: update a PR branch that&apos;s fallen behind main, merge a PR that a teammate already approved and that&apos;s gone green, and open a revert PR. Every one of them is a branch and a PR, or the merge of a PR a person approved. Nothing ever pushes to main.</>,
    ],
  },
  {
    q: "What does it actually install?",
    a: [
      <>The Mac app installs a small CLI, the Claude Code plugin (the hooks and the tools your agent calls), and a daily updater. That&apos;s the whole list. Cursor and Codex get the same hooks in their own formats.</>,
    ],
  },
  {
    q: "Will it slow my agent down?",
    a: [
      <>The check before a write usually takes well under a second. It has a three-second budget, and if DevBrain can&apos;t be reached in that time the write goes through as if DevBrain weren&apos;t there. It can slow your agent by a blink. It can never stop it from working.</>,
    ],
  },
  {
    q: "Do we all have to use the same agent?",
    a: [
      <>No. Claude Code, Cursor and Codex all report the same way and see each other, so one team can be split across all three. The one difference: Cursor can&apos;t ask you a question mid-edit, only refuse, so on Cursor a blocked write stays blocked until you tell the agent what to do.</>,
    ],
  },
  {
    q: "Can I use it on my own?",
    a: [
      <>Yes, and it&apos;s a lot of why we built it. Spawn a second or third session with one command and they&apos;ll stay out of each other&apos;s files the same way teammates do. There&apos;s also a switch that lets DevBrain&apos;s own review turn a PR green when there&apos;s nobody else to approve it, labelled as AI-reviewed so it never looks like a person signed off.</>,
    ],
  },
  {
    q: "How does the panel work?",
    a: [
      <>It lives in the bottom corner of your screen. Move your mouse into the corner and a small badge appears; click it and the panel opens out of the corner. Move away and it&apos;s gone. You pick which corner from the tray menu.</>,
    ],
  },
  {
    q: "Do I need the Mac app?",
    a: [
      <>Yes. The app is how you sign in, pick a repo and get the CLI and the plugin installed, and it&apos;s where the panel and the Console live. There&apos;s no way to use DevBrain without it. Mac only for now; other platforms aren&apos;t built yet.</>,
    ],
  },
  {
    q: "What about sessions I spawn myself?",
    a: [
      <>They&apos;re teammates too. Each one gets its own name (you, you · 2, you · 3), its own presence, its own claims and its own guard. If one of them walks into a file another one is in, it gets stopped the same way a teammate&apos;s agent would.</>,
    ],
  },
  {
    q: "What does it cost?",
    a: [
      <>Nothing. It&apos;s an open beta with a fixed number of seats, and while it runs it&apos;s free. No card, no trial counting down. When that changes you&apos;ll hear it from us first, and nothing will ever be charged to a beta team without asking.</>,
    ],
  },
  {
    q: "What happens to my data if I stop using it?",
    a: [
      <>Unlink the repo and the presence, claims and journals for it stop. Ask and we&apos;ll delete the team&apos;s data entirely. There&apos;s no source code in there to begin with, so what&apos;s being deleted is the metadata above.</>,
    ],
  },
];
