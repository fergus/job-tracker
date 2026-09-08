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

- [x] Local `SKILL.md` reports version 4.2.0
- [x] `node .claude/skills/impeccable/scripts/context.mjs` runs without errors

## Completion
- Completed 2026-09-08: upstream had moved past 4.2.0 — the skill was wholesale-replaced from a fresh clone of `pbakaus/impeccable` at **4.2.2**.
- Structural change: 4.2.x drops the ~115 `scripts/**.mjs` files in favour of a single `scripts/impeccable` shell launcher (plus `impeccable.cmd` and `scripts/VERSION` 0.1.3) that runs a self-contained binary and needs no Node. The old acceptance check `scripts/context.mjs` no longer exists; its replacement is `.claude/skills/impeccable/scripts/impeccable context`.
- Verified: `SKILL.md` reports `version: 4.2.2`; `.claude/skills/impeccable/scripts/impeccable context` runs clean (exit 0) and emits the project's PRODUCT.md design context. No hook or settings entry referenced the removed `.mjs` paths.
