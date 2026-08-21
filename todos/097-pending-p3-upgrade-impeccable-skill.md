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

- [ ] Local `SKILL.md` reports version 4.1.1
- [ ] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors
