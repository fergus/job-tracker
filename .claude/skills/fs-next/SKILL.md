---
name: fs-next
description: Decide what to work on next in job-tracker by gathering open todos, plans, brainstorms, ideation docs, code TODOs and dependency drift, then ranking them and agreeing one task with the user. Use for "what's next", "what should I work on", "review open work", "where were we", or a new session that opens with no clear task. Not for executing the chosen task, and not for the dependency review itself, which is fs-update.
---

# fs-next

Last reviewed: 2026-09-27 on Claude Opus 5.

Find the highest-value next task for job-tracker, agree it with the user, and
hand off. This skill chooses work; it does not do the work.

## Done

You are finished when the user has agreed on one task and it has either been
handed to another skill, or scoped enough to start. Ending with a ranked list
and no decision is not finished.

## Phase 0: Sync

    git pull

If the pull fails, stop and report it before going further - a stale tree makes
every ranking below wrong.

## Phase 1: Gather state

    "$(git rev-parse --show-toplevel)"/.claude/skills/fs-next/gather-state.sh

The script prints one labelled section per source. Read any todo, plan,
brainstorm or ideation file that looks relevant; the listing alone is not
enough to rank anything.

Read .claude/skills/fs-todos/SKILL.md for how todos/ is laid out and what the
priority levels mean. If a file is sitting in `todos/` with a `-complete-`
marker, report it as a cleanup item.

`docs/ideation/` holds early exploration, `docs/brainstorms/` holds
requirement and design work, `docs/plans/` holds plans ready or nearly ready
to execute, and `docs/plans/completed/` holds finished and abandoned ones.

For dependency output, flag anything with a known CVE and cross-reference it
against open p1 and p2 todos so the same work is not proposed twice.

Scan the recent commits for work that implies a follow-up: a feature still
missing tests, a migration worth watching, a TODO added in passing.

## Phase 2: Prioritize

| Priority | Category | Rationale |
|----------|----------|-----------|
| P0 | Security fixes / open p1 todos | Safety first |
| P1 | CVE dependency updates | Reduce attack surface |
| P2 | Open p2 todos / plans ready to execute | Tracked important work |
| P3 | Brainstorms needing plans / non-CVE dependency updates | Advance in-progress design work |
| P4 | Open p3 todos / codebase TODOs | Tech debt |
| P5 | Ideation docs / new ideas | Early-stage exploration |

Within a tier, rank by staleness and impact.

## Phase 3: Recommend and discuss

Present the top recommendation:

    Based on the current state:

    **Recommended: [title]**
    [1-2 sentence reason]

    Type "show all" to see everything I found, or answer the question below.

Then ask up to five questions, one at a time, each with 3-4 concrete options.
Open with "Does this feel right, or would you rather focus on something else?"
If the user accepts and the task is small and clear, skip the rest and hand
off. If they want something else, show the ranked list and let them pick.

If the dependency section came back empty or errored, say so and carry on
rather than stopping - the script swallows npm failures, so silence there means
unknown, not clean.

### "Show all" format

    ## Security / CVEs
    - [item] - [brief context]

    ## Open Todos (todos/)
    - [filename] - [one-line summary]

    ## Active Plans (docs/plans/)
    - [filename] - [one-line summary, status: ready/blocked/stale]

    ## Brainstorms (docs/brainstorms/)
    - [filename] - [one-line summary, next step needed]

    ## Ideation (docs/ideation/)
    - [filename] - [one-line summary]

    ## Dependency Updates
    - [package] [current] -> [latest] - [note if CVE]

    ## Codebase TODOs
    - [file:line] - [TODO text]

    ## Potential Improvements
    - [observation]

## Phase 4: Hand off

| Situation | Action |
|-----------|--------|
| Dependency updates | Invoke `/fs-update` |
| Small fix or TODO, no planning needed | Execute directly |
| Larger feature or refactor | Outline a plan and confirm before starting |
