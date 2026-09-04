# Upgrade impeccable skill 4.1.2 → 4.2.0

- **Priority:** p3
- **Created:** 2026-09-04
- **Category:** Skill

## Problem

Local `.claude/skills/impeccable/SKILL.md` reports version `4.1.2`. Latest on GitHub (`pbakaus/impeccable`) is `4.2.0` (minor bump). Skill updates are not auto-applied by the weekly dependency check.

## Current

`impeccable@4.1.2` (local `.claude/skills/impeccable/SKILL.md`)

## Target

`impeccable@4.2.0`

## Proposed Fix

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
node .claude/skills/impeccable/scripts/context.mjs
```

## Acceptance Criteria

- [ ] Local `SKILL.md` reports version 4.2.0
- [ ] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors
