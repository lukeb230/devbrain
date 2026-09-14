# Terms of Use

**Effective: {{effective}}**

These Terms of Use ("Terms") are an agreement between you and the operator of DevBrain, {{operator}} ("DevBrain", "we", "us"). The operator's legal name and address are available on request at {{contact}}. They cover the DevBrain website at {{domain}}, the DevBrain macOS application, the DevBrain command-line tool and agent plugins, the DevBrain GitHub App, and every related service (together, the "Service").

By downloading the app, signing in, installing the plugin, or using any part of the Service, you agree to these Terms and to our [Privacy Policy](/privacy). If you are accepting on behalf of a company or another organisation, you confirm you have the authority to bind it, and "you" means that organisation as well as you personally. If you do not agree, do not use the Service.

## 1. What the Service is

DevBrain coordinates coding-agent sessions across a software team. It records metadata about work in progress (who is active, which files are being touched, what has been claimed, what merged, what was decided), gives that context to each team member's coding agent, warns an agent before it edits a file a teammate is working in, and shows the same picture to people through a desktop panel and console. Section 6 describes the one part of the Service that can change your repositories, and it is off unless you turn it on.

## 2. Beta status

The Service is currently offered as an open beta. That means:

- It is free of charge while the beta runs. See section 9.
- It is early software. It may have bugs, gaps, outages, and data problems, and features may change or be removed without notice.
- Access is limited to a fixed number of teams. We may close sign-ups, add a waiting list, or remove inactive teams to make room, at our discretion.
- We may end the beta at any time. If we do, we will give you notice through the app or by email where we have one, and section 12 explains what happens to your data.

## 3. Eligibility and accounts

You must be at least 18 years old, or the age of majority where you live, to use the Service.

You sign in with a GitHub account. You are responsible for that account and for everything that happens under it in the Service. Keep it secure, and tell us if you believe it has been compromised.

Each device you use the Service from receives a device token. Treat device tokens like passwords: do not share them, and revoke any you no longer use from the app.

## 4. Your permission to use the Service

Subject to these Terms, we grant you a limited, revocable, non-exclusive, non-transferable licence to install and use the DevBrain app, command-line tool and plugins on devices you control, for your own or your organisation's software development, during the beta and any period for which you hold a valid account afterwards.

You may not:

- copy, modify, distribute, sell, lease, or sublicense any part of the Service, except as expressly permitted by these Terms or by a licence we have published;
- reverse engineer or decompile the app except to the extent the law gives you a right we cannot exclude;
- remove or alter any notice, mark, or attribution in the Service;
- use the Service to build a competing product by systematically extracting its data or behaviour.

Our source code is publicly viewable at {{repo}}. Being able to read it does not grant you a licence to it beyond what a licence file in that repository, if any, expressly says.

## 5. Your repositories and content

To do its job, the Service connects to GitHub repositories you choose, through the DevBrain GitHub App and through the plugin running in your coding agent. You must only connect repositories and accounts that you are authorised to connect, and you must have the right to let us process the information the Privacy Policy describes for each of them.

You keep every right you have in your code, your repositories, and the content of your sessions. You grant us only what is needed to run the Service for you: a licence to receive, store, process, and display the metadata, summaries, and records the Privacy Policy describes, for your team, for as long as you use the Service and for the retention periods it sets out.

You are responsible for the content you and your agents send through the Service, including the content of prompts, session transcripts, task titles, decisions, broadcasts, and handoffs. Do not send us content you are not permitted to send to a third-party AI provider, and do not put secrets, credentials, or personal data about other people into free-text fields.

## 6. Writing to your repositories

By default the Service reads repository metadata and never writes to your repositories. A team admin can enable, per repository and one rule at a time, exactly three write actions: updating an open pull-request branch from its base, merging a pull request that a person has already approved and whose checks are green (your repository's own branch protection remains the final gate), and opening a revert pull request. Nothing in the Service pushes to a default branch or commits outside a pull request.

If your team turns any of these on, you are choosing to let the Service act on your repositories under those rules. You remain responsible for your repositories, your branch-protection settings, and for reviewing what merges. Every write the Service performs is recorded where your team can see it.

## 7. Coding agents and AI output

The Service works with third-party coding agents (currently Claude Code, Cursor, and Codex) that you install and run under your own agreements with their providers. We do not control those agents, and the Service cannot guarantee that an agent will honour a warning or a claim. In particular, some agents can only refuse an action, not ask you about it, and every agent can be instructed by its user to proceed.

Some parts of the Service, including pull-request reviews, session journals, standup digests, and task suggestions, are generated by an AI model provided by a third party. AI output can be incomplete, out of date, or wrong. It is an aid to your judgement, not a substitute for it. A green merge light is a signal, never a guarantee. You are responsible for what you merge, ship, and rely on.

## 8. Acceptable use

You agree not to:

- access or attempt to access another team's data, or any part of the Service you are not authorised to use;
- probe, scan, or test the Service for vulnerabilities without our written permission (if you find one, please tell us; see section 18);
- interfere with the Service, overload it, or circumvent limits, rate limits, or access controls;
- use the Service to violate any law, or anyone else's rights, or any agreement you have with a third party (including GitHub's and your AI providers' terms);
- upload malicious code, or use the Service to distribute it;
- impersonate anyone, or misrepresent your affiliation with any person or organisation;
- resell the Service, or offer it to third parties as your own, without our written agreement.

## 9. Fees

The Service is free during the open beta. We will not charge you, and we will not ask for payment details, for beta use.

If we introduce paid plans after the beta, we will tell you in advance, and no team will be charged without first agreeing to a plan and its price. Any team that does not agree keeps access to its data for at least 30 days after we tell you, may ask for it to be deleted at any time, and then loses access to the Service.

## 10. Teams and admins

A team in the Service has an owner and may have admins and members. Owners and admins can invite and remove members, link and unlink repositories, enable or disable the write rules in section 6, and change team settings. If you are a team owner or admin, you are responsible for those choices and for making sure the people you invite are authorised to see the team's data.

Members of a team can see the team's coordination data for the repositories linked to that team. Do not join a team, or link a repository to one, if that would expose information to people who should not see it.

## 11. Availability, changes, suspension

We may change, pause, limit, or discontinue any part of the Service at any time, including by imposing usage caps such as a daily allowance of AI-generated output per team. Because the Service is free and early, it comes with no uptime or support commitment.

We may suspend or terminate your access, or a team's access, if we reasonably believe you have breached these Terms, if your use puts the Service or other users at risk, if we are required to by law, or if we discontinue the Service. Where practical we will tell you why.

## 12. Ending your use, and your data

You may stop using the Service at any time by revoking your device tokens, unlinking or deleting your repositories in DevBrain, leaving your teams, and deleting the app. Unlinking a repository stops data flow for it and keeps its history; deleting it removes every record for it.

When a team is deleted by its owner, or on a verified request from a team owner or admin, we delete the team's data, subject to the retention periods described in the Privacy Policy. If we discontinue the Service or end the beta, we will give you at least 30 days' notice where we can, during which you may ask for your team's data to be deleted; after that period we may delete it ourselves.

Sections 4 (restrictions), 5 (your content, to the extent needed to wind down), 7, 9 (any fees already due), 12, 13, 14, 15, 16, 17, and 18 survive the end of these Terms.

## 13. Intellectual property

The Service, including the app, the plugins, the website, and all software, designs, text, and marks that make them up, is owned by us or our licensors and protected by copyright, trademark, and other laws. Apart from the licence in section 4 and any open-source licences we publish, these Terms give you no rights in it.

"DevBrain" and the DevBrain mark are our marks. {{trademarks}}

If you send us feedback, suggestions, or ideas about the Service, you agree we may use them without restriction or payment to you. We will not claim that any feedback came from you without your permission.

## 14. Disclaimers

The Service is provided "as is" and "as available". To the fullest extent permitted by law, we disclaim all warranties, express or implied, including warranties of merchantability, fitness for a particular purpose, title, and non-infringement, and any warranty that the Service will be uninterrupted, error-free, secure, or that it will detect every collision, prevent every conflict, or produce correct AI output.

Keep your own backups and your own code review. The Service assists your process; it does not replace it.

Some jurisdictions do not allow certain warranty exclusions, so some of the above may not apply to you.

## 15. Limitation of liability

To the fullest extent permitted by law, we and our affiliates, officers, employees, contractors, and licensors will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue, data, work, or goodwill, arising out of or related to the Service or these Terms, even if we have been told such damages are possible. This includes losses caused by a collision the Service did not catch, a merge it performed under a rule your team enabled, incorrect AI output, or an outage.

To the fullest extent permitted by law, our total liability to you for all claims arising out of or related to the Service or these Terms will not exceed the greater of the amount you paid us in the twelve months before the claim (which, during the beta, is nothing) and one hundred US dollars.

Some jurisdictions do not allow certain limitations of liability, so some of the above may not apply to you.

## 16. Indemnity

You will defend, indemnify, and hold us harmless from claims, losses, and expenses (including reasonable legal fees) arising out of your use of the Service, your content, your teams' use of the write rules in section 6, or your breach of these Terms or of any law or third-party right, except to the extent caused by our own breach of these Terms.

## 17. Governing law and disputes

These Terms are governed by the laws of {{law}}, without regard to conflict-of-law rules. Any dispute arising out of or relating to these Terms or the Service will be brought exclusively in the state or federal courts located in {{venue}}, and you consent to their jurisdiction, except that either party may seek injunctive relief in any court of competent jurisdiction to protect its intellectual property.

Before starting any formal proceeding, you agree to email us at {{contact}} and give us 30 days to try to resolve the matter informally.

## 18. General

- **Changes to these Terms.** We may update these Terms. If a change is material, we will give notice through the app, the website, or by email where we have one, at least 14 days before it takes effect, unless the change is required by law or addresses a security issue. Continuing to use the Service after the effective date means you accept the new Terms.
- **Entire agreement.** These Terms and the Privacy Policy are the whole agreement between you and us about the Service, and replace any earlier agreement.
- **Severability.** If any part of these Terms is found unenforceable, the rest stays in effect.
- **No waiver.** Our not enforcing a provision is not a waiver of it.
- **Assignment.** You may not assign these Terms without our consent. We may assign them to an affiliate or a successor to the Service.
- **Third-party services.** GitHub, Apple, and the AI and agent providers are not parties to these Terms and have no obligations to you under them.
- **Export and sanctions.** You may not use the Service where doing so is prohibited by applicable export-control or sanctions law.
- **Contact.** DevBrain, {{contact}}. Security reports: {{securityContact}}.
