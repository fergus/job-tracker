---
name: fs-next
description: Review open work, check for updates, and determine what to work on next through guided conversation
---

# fs-next

Identify the highest-priority next task for the job-tracker project by reviewing open work items, checking for dependency updates, and guiding the user to a decision through focused questions.

## Trigger

- Manually via `/fs-next`
- Suggest when a new conversation starts with no clear task (e.g. "what should I work on?", "what's next?", vague greetings with no directive)

## Phase 0: Sync with GitHub

Before anything else, pull the latest changes:

```bash
git pull
```

If the pull fails (e.g. merge conflict), stop and report the issue to the user before proceeding.

## Phase 1: Gather State

Run the gather script to collect all project state in one shot:

```bash
.claude/skills/fs-next/gather-state.sh
```

The script outputs eight labelled sections: pending todos, ideation docs, brainstorm docs, plan docs, source TODOs/FIXMEs, outdated client packages, outdated server packages, and recent commits. Read the content of any pending todo files, ideation docs, brainstorms, or plans that look relevant to understand the full context.

Files in `todos/` are named `NNN-(complete|pending)-pN-description.md`. A todo is open if it contains `-pending-` in the filename. Priority is `p1` (critical) through `p3` (minor).

Files in `docs/ideation/` are early-stage exploration docs — ideas that haven't been committed to yet. Files in `docs/brainstorms/` are deeper requirement/design explorations. Files in `docs/plans/` are implementation plans ready (or nearly ready) to execute. Read any of these that look relevant to understand scope and status.

Flag any outdated packages with known CVEs (cross-reference with pending p1/p2 todos). Patch-level updates are low priority unless they fix CVEs.

Scan recent commits for work that might have introduced follow-up tasks (e.g. a feature that still lacks tests, a migration that may need monitoring, a TODO added in passing).

## Phase 2: Prioritize

Rank all discovered items using this priority order:

| Priority | Category | Rationale |
|----------|----------|-----------|
| P0 | Security fixes / p1 todo items | Safety first |
| P1 | CVE dependency updates | Reduce attack surface |
| P2 | Pending p2 todo items / plans ready to execute | Tracked important work |
| P3 | Brainstorms needing plans / minor dependency updates (non-CVE) | Advance in-progress design work |
| P4 | Pending p3 todo items / codebase TODOs | Tech debt |
| P5 | Ideation docs / new improvement ideas | Early-stage exploration |

Within each priority tier, rank by staleness (older = higher priority) and impact.

## Phase 3: Recommend and Discuss

Present the top recommendation with a brief rationale:

```
Based on the current state:

**Recommended: [title]**
[1-2 sentence reason]

Type "show all" to see everything I found, or answer the question below.
```

Then ask **one question at a time** using the `AskUserQuestion` tool to refine the choice and scope. Every question MUST include 3-4 selectable options. Wait for the user's answer before asking the next question.

- Start with: "Does this feel right, or would you rather focus on something else?" with options like:
  1. Yes, let's do it
  2. Show me all options
  3. I have something else in mind
- If the user accepts, ask scoping questions if the task is ambiguous or large (up to 3-4 more questions max)
- If the task is small and clear, skip straight to handoff
- If the user wants something else, present the ranked list and let them pick

**Important:** Always use `AskUserQuestion` for interactive questions — never rely on plain text prompts. Each question must have 3-4 concrete options the user can select from. Wait for the response before proceeding.

### "Show All" Response Format

Group by category:

```
## Security / CVEs
- [item] — [brief context]

## Pending Todos (todos/)
- [NNN-pending-pN-description] — [one-line summary]

## Plans (docs/plans/)
- [filename] — [one-line summary, status: ready/blocked/stale]

## Brainstorms (docs/brainstorms/)
- [filename] — [one-line summary, next step needed]

## Ideation (docs/ideation/)
- [filename] — [one-line summary]

## Dependency Updates
- [package] [current] → [latest] — [note if CVE]

## Codebase TODOs
- [file:line] — [TODO text]

## Potential Improvements
- [observation]
```

## Phase 4: Hand Off

Once a task is chosen and scoped, hand off to the appropriate skill or execute directly:

| Situation | Action |
|-----------|--------|
| Dependency updates | Invoke `/fs-update` |
| Small fix / TODO (no planning needed) | Execute directly |
| Larger feature / refactor | Outline a plan and confirm before starting |

## Guardrails

- Never start work without user confirmation on what to do
- Ask at most 5-6 questions total before starting — adapt based on task complexity
- If dependency checks fail (network issues), report what you found and move on — don't block the workflow
- Don't fabricate update information — if you can't verify a version, say so
- Keep the conversation moving — each question should have selectable options where possible
