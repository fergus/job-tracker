---
name: fs-todos
description: The layout and conventions of the todos/ directory in job-tracker - how a todo is named and numbered, how open and done are distinguished, what goes inside one, and what p1/p2/p3 mean. Read this before creating, closing, reading or counting a todo, or when deciding whether a piece of work is already tracked. Not for deciding what to work on next (that is fs-next) and not for the dependency review that produces todos (that is fs-update).
---

# The todos/ directory

Last reviewed: 2026-09-27 on Claude Opus 5.

Tracked work for job-tracker lives in `todos/` as one markdown file per item.
This skill is the only description of that layout; fs-next and fs-update both
defer to it.

## Open versus done

Location decides, and nothing else:

- Open: the file sits directly in `todos/`.
- Done: the file has been moved into `todos/complete/`.

Filenames carry a `pending` or `complete` marker, but it is not maintained
reliably - many files in `todos/complete/` still read `-pending-`. Never infer
status from the filename.

List open todos:

    ls todos/*.md

*Why location and not the filename:* a move is one operation and cannot be half
done. Renaming and moving are two, and the rename is the one that gets
forgotten.

## Filename

    NNN-<pending|complete>-<pN>-<kebab-slug>.md

`NNN` is a zero-padded three-digit id, unique across both directories and never
reused. This prints the highest id in use; the next one is that plus one:

    ls todos/*.md todos/complete/*.md | xargs -n1 basename | cut -d- -f1 | sort -n | tail -1

Set the marker to `pending` when you create the file. When closing a todo,
move it to `todos/complete/` and rename the marker to `complete` in the same
step, so the two never disagree.

## Priority

| Level | Meaning | Examples |
|-------|---------|----------|
| p1 | Critical. Data loss, corruption, security hole, or the app is broken | binary hash corruption, auth bypass |
| p2 | Important. Known CVEs, correctness bugs, work that blocks other work | CVE in a dependency, a wrong query pattern |
| p3 | Minor. Tech debt, non-CVE dependency bumps, polish | minor or patch version upgrades, refactors |

A dependency update is p2 if it fixes a CVE and p3 otherwise, regardless of
whether the bump is major, minor or patch.

## Contents

Start with an H1 stating the change, then a metadata block, then the body. The
newest todos look like this, and new ones should match:

    # Upgrade multer 2.3.0 to 2.4.0 (minor, server)

    - **Priority:** p3
    - **Created:** YYYY-MM-DD
    - **Category:** npm dependency (server)

    ## Problem

    <what is wrong or what risk this carries>

    ## Current

    <the present state, with versions or file references>

Add `- **Updated:** YYYY-MM-DD (what changed)` when revising an open todo
rather than editing the Created line, so the history stays readable.

Older files in `todos/complete/` use a YAML frontmatter block instead. That
form is historical. Do not copy it into new todos and do not rewrite the old
ones to match.

## Done

A todo you create is finished when `ls todos/*.md` shows it with a `p1`, `p2`
or `p3` in its name and an id higher than every existing one. A todo you close
is finished when it appears under `todos/complete/` with a `-complete-` marker
and `git status` shows the move as a rename.
