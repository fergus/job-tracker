# Update impeccable skill 4.5.2 to 4.7.1

- **Priority:** p3
- **Created:** 2026-10-16
- **Updated:** 2026-10-25 (weekly dep check; upstream moved 4.7.0 → 4.7.1)
- **Category:** Tooling (`.claude/skills/impeccable`)

## Problem

The vendored `impeccable` skill in `.claude/skills/impeccable/` is at 4.5.2;
upstream `pbakaus/impeccable` is at 4.7.1. The weekly dependency check compares
the local skill against GitHub raw and flags any mismatch for manual review,
because the update replaces files in-tree and can carry behavioural changes to
the design workflow.

The gap is now two minor versions (4.5.2 → 4.6.0 → 4.7.0 → 4.7.1), so the changelog
review should cover both.

## Current

- Local version: 4.5.2 (`.claude/skills/impeccable/SKILL.md`)
- Upstream version: 4.7.1
- Upstream source: https://github.com/pbakaus/impeccable

## Proposed Solutions

### Option A: Re-vendor the skill from upstream

Follow the impeccable update procedure in `.claude/skills/fs-update/SKILL.md`:
clone upstream to a temp dir, diff it against the vendored copy, review the
changes, then replace `.claude/skills/impeccable/` wholesale and run
`impeccable doctor` afterwards.

```bash
cd /tmp && rm -rf impeccable && git clone --depth 1 https://github.com/pbakaus/impeccable.git
diff -rq /tmp/impeccable/.claude/skills/impeccable /home/fstevens/code/job-tracker/.claude/skills/impeccable
```

- **Effort**: Small-to-moderate | **Risk**: Low (tooling only, not shipped code)

## Acceptance Criteria

- [ ] Local `.claude/skills/impeccable/SKILL.md` reads `version: 4.7.1`
- [ ] Diff against upstream reviewed before the swap
- [ ] `impeccable doctor` runs without unresolved drift
