# Upgrade eslint 10.10.0 → 10.11.0 (minor, client)

- **Priority:** p3
- **Created:** 2026-09-19
- **Category:** npm dependency (client, dev)

## Problem

`eslint` is at `^10.10.0` in `client/devDependencies`. Latest is `10.11.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`eslint@10.10.0` (client, devDependency)

## Target

`eslint@10.11.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/client && npm install --save-dev eslint@10.11.0
```

Watch `eslint-plugin-vue@^10.11.0` and `@eslint/js@^10.0.1` compatibility — if the plugin declares a peer range on eslint, npm will warn.

## Acceptance Criteria

- [ ] `client/package.json` references `^10.11.0` for `eslint`
- [ ] `npx eslint .` in `client/` runs with no new errors introduced
- [ ] Client builds clean (`npm run build:client` from repo root)

## Notes

- Dev tooling only — no runtime or production impact.
- No prior eslint upgrade todo exists; this is the first time it has drifted since the 10.x line was adopted.
