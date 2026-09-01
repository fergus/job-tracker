# Upgrade impeccable skill 4.1.1 → 4.1.2

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** Skill

## Problem

Local `.claude/skills/impeccable/SKILL.md` reports version `4.1.1`. Latest on GitHub (`pbakaus/impeccable`) is `4.1.2` (patch bump). Skill updates are not auto-applied by the weekly dependency check.

## Current

`impeccable@4.1.1` (local `.claude/skills/impeccable/SKILL.md`)

## Target

`impeccable@4.1.2`

## Proposed Fix

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
node .claude/skills/impeccable/scripts/context.mjs
```

## Acceptance Criteria

- [x] Local `SKILL.md` reports version 4.1.2
- [x] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors

## Completion
- Completed 2026-09-01: impeccable wholesale-replaced from fresh clone of `pbakaus/impeccable` (4.1.2). SKILL.md reports `version: 4.1.2`. `node .claude/skills/impeccable/scripts/context.mjs` runs clean (exit 0).
