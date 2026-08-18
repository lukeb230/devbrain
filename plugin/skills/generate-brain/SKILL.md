---
name: generate-brain
description: Generate or regenerate a repo's Second Brain (.brain/ folder) as an Obsidian-style linked knowledge graph. Use when a repo has no .brain/, when the user says "generate the brain", "brainify this repo", "build the knowledge graph", or after large refactors that made the existing brain stale.
---

# Generate the Second Brain

You are building the shared knowledge graph that briefs every developer's
Claude on this codebase — and renders as a clickable graph in DevBrain. Follow
the format EXACTLY; the graph UI parses it.

## Output format (strict)

Everything lives in `.brain/` at the repo root:

```
.brain/
  index.md          # the entry point: what the app is, how to run it, note map
  notes/<slug>.md   # one note per feature / module / service / screen / concept
```

Every note (including index.md) starts with YAML frontmatter:

```markdown
---
title: Gear List
type: feature
touches:
  - src/components/GearList.tsx
  - src/lib/store.ts
---
One-paragraph summary a new Claude reads first.

## How it works
...concise, dense, factual...

## Connections
Renders items from [[Store]] and mutates them via [[Store]] actions.
Status colors come from [[Formatting Helpers]].
```

Rules:
- `title`: human name, unique across notes.
- `type`: one of `overview | feature | module | service | screen | data | decision | gotcha`.
- `touches`: repo-relative source files this note describes (the file→feature
  map DevBrain uses). Only files that truly belong to the note.
- **Wikilinks** `[[Title]]` are the graph's edges. Every note MUST link every
  other note it genuinely interacts with — in prose, where the relationship is
  explained. No orphan notes: everything connects to something.
- Slug = kebab-case of title (`Gear List` → `notes/gear-list.md`).
- Notes are for agents first: dense, factual, no filler. 15–40 lines each.
- Two required special notes: `notes/decisions.md` (type: decision — the
  append-at-top decisions log) and `notes/gotchas.md` (type: gotcha — traps
  and landmines), both wikilinked from the notes they concern.

## Procedure

1. Inventory the codebase (structure, entry points, data flow) before writing.
2. Choose note granularity: one note per meaningful feature/module — a 10-file
   app might have 8 notes; a large app 30–60. Every source file should appear
   in exactly one note's `touches` (shared infra files may appear in a module
   note others link to).
3. Write `index.md` (type: overview): what the app is, stack, how to run,
   build/test commands, team rules, and a linked map of every note grouped by
   type.
4. Write the notes, connections included as you go.
5. Verify: every `[[wikilink]]` target exists as a note title; every note is
   linked from at least one other note; `touches` paths exist in the repo.
6. Do all of this on a branch and open a PR — the brain is reviewed like code.

## Regenerating an existing brain

Never blind-overwrite: read the existing notes first and preserve
human-written decisions and gotchas verbatim (append, don't rewrite them).
Restructure the rest freely to match reality.
