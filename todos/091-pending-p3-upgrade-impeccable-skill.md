# Upgrade impeccable skill 3.5.0 → 4.0.4

- **Priority:** p3
- **Created:** 2026-07-31
- **Category:** Skill

## Problem

The local `.claude/skills/impeccable/` is at version `3.5.0`. Latest on GitHub (`pbakaus/impeccable`) is `4.0.4` (major bump).

## Current

`impeccable@3.5.0` (local `.claude/skills/impeccable/SKILL.md`)

## Target

`impeccable@4.0.4`

## Proposed Fix

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
node .claude/skills/impeccable/scripts/cleanup-deprecated.mjs
```

## Acceptance Criteria

- [ ] Local `SKILL.md` reports version 4.0.4
- [ ] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors
