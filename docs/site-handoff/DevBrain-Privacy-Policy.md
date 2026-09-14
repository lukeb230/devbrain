# DevBrain Privacy Policy

**Effective: [EFFECTIVE DATE]**

This policy explains what DevBrain ("we", "us") collects when you use the DevBrain website at [DOMAIN], the DevBrain macOS application, the command-line tool and agent plugins, and the DevBrain GitHub App (together, the "Service"), why we collect it, who sees it, and what you can do about it. It is written to be read. If anything here is unclear, ask us at [EMAIL].

DevBrain is operated by a sole proprietorship trading as DevBrain. The legal name and address of the operator are available on request at [EMAIL] and appear in our Terms of Use.

## 1. The short version

DevBrain coordinates coding-agent sessions across a team. To do that it stores **metadata about your work**: who is active, which files were touched, task and pull-request records, and short redacted session summaries. It does **not** store your source code. By default it does not write to your GitHub repositories; a team admin can turn on three specific writes per repository, described in section 6. Two kinds of content are sent to a third-party AI provider to produce reviews and summaries, and are not kept afterwards (section 5).

## 2. What we collect

**Account information.** When you sign in with GitHub we receive your GitHub login, display name, avatar, and the email address on your GitHub account. We use them to create your account, show you to your teammates, and contact you about the Service.

**Device tokens.** Each Mac you use the Service from receives a token that identifies it. We store a hash of the token, never the token itself, along with the label you give the device and when it was last used.

**Repository metadata.** Through the GitHub App, for repositories your team links, we receive repository names, branch names, and pull-request details: number, title, author, review state, mergeability, draft status, and the list of changed file paths. We do not receive or store file contents through the GitHub App.

**Activity and presence.** From the plugin running in your coding agent we receive: that a session started and ended, the repository and branch it is on, the file paths it reads and edits, the tool in use (for example Claude Code, Cursor, or Codex), a short status phrase, claims your agent makes on paths, and the timestamps of these events. This is the signal that powers collision warnings and the team's live view. File contents and command output are not sent.

**Things you or your agents write into the Service.** Task titles and details, decisions, broadcasts, handoffs, notes, and the free-text parts of any of these. Please do not put secrets, credentials, or personal data about other people into them.

**Session journals (optional, off by default).** If a team admin turns journals on, when a coding session ends the plugin extracts a redacted excerpt of the session: the conversation turns and the names of tools and files used, with file contents and command output removed. The excerpt is sent to the AI provider (section 5) to produce a short journal entry (what was learned, what was tried and failed, what remains). We store the journal entry. We do not store the excerpt.

**Pull-request reviews.** When the Service reviews a pull request, it fetches the pull request's diff from GitHub and sends it to the AI provider (section 5) to produce a review. We store the resulting verdict and summary, not the diff.

**Spec documents (optional).** If you drop a document into the Specs feature, we store its text (converted from PDF, Markdown, HTML, or pasted text) so it can be broken into tasks, and we send that text to the AI provider for extraction.

**Usage and technical data.** Server logs (IP address, user agent, request path, timestamps, error details) kept for security and debugging, and privacy-preserving, cookie-free page analytics on the website if we enable them. We do not use advertising trackers.

**Email addresses you give us on the website.** If you leave an email address to hear about the beta, we store it with the date and the page it came from, and use it only to contact you about DevBrain.

## 3. What we do not collect

- Your source code, other than a pull-request diff in transit to the AI provider (section 5) and the contents of spec documents you choose to upload.
- Command output from your agent sessions.
- Readable copies of API keys or tokens.
- Anything from repositories your team has not linked.
- Payment details. There are none during the beta.

## 4. Why we use it (legal bases)

We use the information above to provide the Service you asked for (running the coordination layer, showing your team its live state, briefing your agents), to keep it secure and working, to communicate with you about it, and to understand how it is used so we can improve it. Where the law requires a legal basis, ours is performance of our agreement with you (the Terms of Use), our legitimate interests in running and securing the Service, and, for optional features such as journals and for marketing email, your or your team admin's consent, which can be withdrawn.

## 5. Who we share it with

We do not sell your information, and we do not share it with other teams. Every record is scoped to one team.

We share information with these service providers, only as needed to run the Service:

- **AI provider: [AI PROVIDER, currently Anthropic (the Claude API)].** Receives pull-request diffs, redacted session excerpts, and spec text to generate reviews, journals, digests, and task extractions. DevBrain does not retain that content beyond the result. The provider's handling of it is governed by its own terms; we use API access whose terms do not permit training on our inputs.
- **GitHub.** The GitHub App exchanges repository metadata and, where a write rule is enabled, performs the actions in section 6. GitHub's own privacy statement applies to your GitHub account.
- **Hosting and infrastructure.** [HOSTING PROVIDER, e.g. Vercel] (application hosting), [DATABASE PROVIDER, e.g. Supabase] (database and realtime), and [EMAIL PROVIDER, if any] (transactional email). These providers process data on our behalf under their standard terms.
- **Apple.** The macOS app is distributed as a signed and notarised download. Apple may receive notarisation and crash information under its own policies.

We may also disclose information if required by law, to protect the rights, safety, or property of users or the public, or as part of a merger, acquisition, or sale of the Service, in which case this policy will continue to apply to the transferred data until it is updated.

## 6. Writing to your repositories

DevBrain reads repository metadata through its GitHub App. Writing is off by default and is enabled per repository by a team admin, one rule at a time. There are exactly three, and no other code path in DevBrain writes to GitHub:

- **Update a pull-request branch:** bring an open pull request up to date with its base branch.
- **Merge a pull request:** only one that already carries the approval your repository's own branch protection requires.
- **Open a revert pull request:** a new branch and pull request that you then review.

Nothing pushes to a default branch, nothing commits outside a pull request, and every write is recorded as an event your team can see.

## 7. Where your data is kept, and for how long

Data is stored on servers operated by our hosting and database providers in [REGION, e.g. the United States]. If you use the Service from elsewhere, your data is transferred to and processed there.

- **Presence and activity:** rolling; a session's presence is removed when it ends or goes stale, and activity records are purged on a rolling basis measured in days.
- **Claims:** expire on their own schedule (hours) or when released.
- **Completed tasks and journal queues:** purged within days.
- **Journals, decisions, broadcasts, handoffs, and pull-request review results:** kept as team memory until the repository is unlinked or the team is deleted.
- **Repository metadata and pull-request records:** kept while the repository is linked; removed when it is unlinked.
- **Account information:** kept while you have an account.
- **Server logs:** [30] days.
- **Website email sign-ups:** until you ask us to remove you.
- **Backups:** encrypted database backups are kept for up to [30] days and then overwritten; deleted data may persist in backups for that period.

## 8. Security

Device tokens are stored only as hashes. Every record is scoped to one team and access is checked on every request. Data is encrypted in transit and at rest by our providers. Access to production data is limited to the people who operate the Service and is used only to run and support it. No system is perfectly secure; if we learn of a breach affecting your data we will tell you without undue delay and, where required, notify the relevant authorities.

If you find a security issue, please tell us at [SECURITY EMAIL] before disclosing it publicly.

## 9. Your controls and rights

At any time you can, from the app or the Console:

- revoke any device token;
- unlink a repository, which removes the GitHub App from it and stops all data flow for it immediately;
- leave a team;
- turn journals off (team admins), which stops excerpts being collected;
- disable any write rule (team admins).

You can also ask us to export the data we hold about you or your team, to correct it, or to delete it, by writing to [EMAIL]. We will act on a verified request within 30 days. Deleting a team removes its coordination data, memory, and repository records, subject to the backup period in section 7. Some records may be kept where the law requires it or where we need them to resolve a dispute.

If you are in the European Economic Area, the United Kingdom, or another jurisdiction with data-protection law, you have the rights that law gives you, including to access, correct, delete, restrict, or object to processing, to data portability, to withdraw consent, and to complain to your supervisory authority. Where we rely on consent, withdrawing it does not affect processing before the withdrawal. If you are a California resident, you have the rights under the CCPA/CPRA to know, delete, and correct your personal information and not to be discriminated against for exercising them; we do not sell or share personal information for cross-context behavioural advertising.

## 10. Children

The Service is not directed at children and we do not knowingly collect information from anyone under 18 (or the age of majority where they live). If you believe we have, tell us and we will delete it.

## 11. Cookies

The website and app use only the cookies needed to keep you signed in and to protect against request forgery. We do not use advertising or cross-site tracking cookies. Any analytics we run on the website are cookie-free.

## 12. Changes to this policy

We may update this policy as the Service changes. If a change is material, we will give notice through the app, the website, or by email where we have one, before it takes effect. The effective date at the top tells you when it last changed.

## 13. Contact

[EMAIL]

---

*Placeholders to fill before publishing: [DOMAIN], [EMAIL], [SECURITY EMAIL], [AI PROVIDER] (keep in step with `LEGAL.aiProvider`), [HOSTING PROVIDER], [DATABASE PROVIDER], [EMAIL PROVIDER], [REGION], the two [30]-day figures (confirm against actual log and backup retention), and [EFFECTIVE DATE]. The retention lines in section 7 restate the current behaviour described in the existing privacy page and in `retire.ts`; confirm each against the code before publishing. This is a plain-language description of current behaviour, provided in good faith. It is not legal advice; have a lawyer review it before real teams rely on it.*
