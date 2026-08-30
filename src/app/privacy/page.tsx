import Link from "next/link";
import { LEGAL } from "@/lib/legal";

export const metadata = { title: "Privacy — DevBrain" };

// Written from what the code actually does. This is a plain-language draft
// grounded in the real data flows; it is not legal advice and should be
// reviewed before being relied on.
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-slate-800">
      <Link href="/" className="text-sm text-brand-600 hover:underline">← DevBrain</Link>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">Privacy</h1>
      <p className="mt-1 text-sm text-slate-500">Effective {LEGAL.effective}</p>

      <Section title="The short version">
        DevBrain coordinates coding-agent sessions across a team. To do that it stores
        <em> metadata about your work</em> — who is active, which files were touched, task and PR
        records, and short redacted session summaries. It does <strong>not</strong> store your source
        code, and it never writes anything back to your GitHub repositories.
      </Section>

      <Section title="What we store">
        <ul className="ml-5 list-disc space-y-1.5">
          <li><strong>Account:</strong> your GitHub login and email, via GitHub sign-in.</li>
          <li><strong>Repository metadata:</strong> repo names, branches, and pull-request details
          (title, author, status) received from the GitHub App&apos;s webhooks. Not file contents.</li>
          <li><strong>Activity &amp; presence:</strong> which files a session edited, the tool used, and a
          short status phrase — the coordination signal that powers collision warnings.</li>
          <li><strong>Session journals:</strong> when a coding session ends, a <em>redacted excerpt</em>
          is summarized into a journal. The excerpt is the conversation and the <em>names</em> of tools
          and files used — never file contents, never command output.</li>
          <li><strong>Team memory:</strong> decisions, handoffs, and the above, searchable by your team.</li>
        </ul>
      </Section>

      <Section title="What we send to a third party">
        To generate PR reviews and journal summaries, DevBrain sends the relevant material — a PR
        <em> diff</em>, or a redacted session excerpt — to {LEGAL.aiProvider} for processing. That content
        is <strong>not retained by DevBrain</strong> beyond the resulting review or summary, and the diff
        itself is never stored in our database — only the verdict and summary are kept. Your GitHub
        access is scoped by the DevBrain GitHub App&apos;s permissions, which are read-oriented.
      </Section>

      <Section title="What we never do">
        <ul className="ml-5 list-disc space-y-1.5">
          <li>Store your source code, or post anything to your GitHub repositories.</li>
          <li>Store API keys or tokens in readable form — dev tokens are kept only as hashes.</li>
          <li>Share your data with other teams. Every record is scoped to one team.</li>
        </ul>
      </Section>

      <Section title="Retention">
        Operational records are purged automatically: completed tasks and session-journal queues within
        days, and coordination data on a rolling basis. Journals and decisions persist as team memory
        until the team or repository is removed.
      </Section>

      <Section title="Your controls">
        You can revoke a dev token, unlink a repository (removing the GitHub App), or leave a team at any
        time. Uninstalling the GitHub App stops all repository data flow immediately.
      </Section>

      <Section title="Contact">
        Questions or a deletion request: {LEGAL.contact}.
      </Section>

      <p className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">
        This is a plain-language description of current behavior, provided in good faith. It is not legal
        advice and may be updated as the product changes.
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
