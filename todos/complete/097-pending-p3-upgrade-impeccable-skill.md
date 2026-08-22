# Upgrade impeccable skill 4.0.4 → 4.1.1

- **Priority:** p3
- **Created:** 2026-08-21
- **Category:** Skill

## Problem

Local `.claude/skills/impeccable/SKILL.md` reports version `4.0.4`. Latest on GitHub (`pbakaus/impeccable`) is `4.1.1` (minor bump). Skill updates are not auto-applied by the weekly dependency check.

## Current

`impeccable@4.0.4` (local `.claude/skills/impeccable/SKILL.md`)

## Target

`impeccable@4.1.1`

## Proposed Fix

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
node .claude/skills/impeccable/scripts/cleanup-deprecated.mjs
```

## Acceptance Criteria

- [x] Local `SKILL.md` reports version 4.1.1
- [x] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors

## Completion
- Completed 2026-08-22: impeccable wholesale-replaced from fresh clone of `pbakaus/impeccable` (4.1.1). SKILL.md reports `version: 4.1.1`. Note: the proposed fix's `cleanup-deprecated.mjs` step is stale — 4.x no longer ships that script; correct post-install check is `node .claude/skills/impeccable/scripts/context.mjs`, which runs clean.
