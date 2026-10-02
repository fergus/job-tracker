# Update impeccable skill 4.4.0 → 4.5.0 (project tooling)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** project skill (`.claude/skills/impeccable/`)

## Problem

The vendored `impeccable` skill is at version `4.4.0`
(`.claude/skills/impeccable/SKILL.md`). Upstream `pbakaus/impeccable` on `main`
is at `4.5.0`. The weekly dependency check flags the mismatch but does not
auto-apply skill updates.

## Current

`impeccable@4.4.0` (local `SKILL.md` frontmatter)

## Target

`impeccable@4.5.0`

## Proposed Fix

Per the project's `fs-update` skill (`.claude/skills/fs-update/SKILL.md`):

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
node .claude/skills/impeccable/scripts/cleanup-deprecated.mjs
```

Then remove any `<post-update-cleanup>` section from `.claude/skills/impeccable/SKILL.md`.

Check the upstream diff before copying — 4.5.0 may have added or renamed reference
files, and the `scripts/` launcher binary may need to re-download.

## Acceptance Criteria

- [ ] `.claude/skills/impeccable/SKILL.md` frontmatter reads `version: 4.5.0`
- [ ] Any new/renamed `reference/*.md` files are present
- [ ] No `<post-update-cleanup>` section remains in `SKILL.md`
- [ ] `.claude/skills/impeccable/scripts/impeccable doctor` reports no drift (if the launcher runs cleanly)

## Notes

- Source repo: https://github.com/pbakaus/impeccable
- Project tooling, not a runtime dependency — not a deploy blocker.
- Tracked previously in `103`, `107`, `113`, `118` (all complete) — this is the next bump.
