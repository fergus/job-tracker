# Upgrade impeccable skill 4.2.2 → 4.3.1

- **Priority:** p3
- **Created:** 2026-09-11
- **Category:** Skill

## Problem

Local `.claude/skills/impeccable/SKILL.md` reports version `4.2.2`. Latest upstream on GitHub (`pbakaus/impeccable`, tag `skill-v4.3.1`) is `4.3.1` (minor bump). Skill updates are not auto-applied by the weekly dependency check.

## Current

`impeccable@4.2.2` (local `.claude/skills/impeccable/SKILL.md`; launcher `scripts/VERSION` 0.1.3)

## Target

`impeccable@4.3.1`

## Proposed Fix

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 --branch skill-v4.3.1 https://github.com/pbakaus/impeccable.git
cp -r /tmp/impeccable/.claude/skills/* /home/fstevens/code/job-tracker/.claude/skills/
cd /home/fstevens/code/job-tracker && .claude/skills/impeccable/scripts/impeccable context
```

## Acceptance Criteria

- [ ] `.claude/skills/impeccable/SKILL.md` reports `version: 4.3.1`
- [ ] `.claude/skills/impeccable/scripts/impeccable context` runs clean (exit 0) and emits the project's PRODUCT.md design context
- [ ] No hook, settings entry, or sibling skill references a path the new release removed

## Notes

- Previous impeccable upgrades: `091` (3.5.0 → 4.0.4), `097`, `103` (→ 4.2.2). The 4.2.x structural change (single `scripts/impeccable` launcher binary replacing ~115 `.mjs` files) is already in place — verify 4.3.1 keeps that layout before copying.
- The `ce-*` skills in `.claude/skills/` are a separate bundle and are not version-checked by this run.
