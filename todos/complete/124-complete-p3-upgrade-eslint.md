# Upgrade eslint 10.11.0 → 10.12.0 (minor, client dev)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** npm dependency (client, devDependency)

## Problem

`eslint` is at `10.11.0` in `client/devDependencies`. Latest is `10.12.0` (minor
bump, same major). Build tooling only — not a deploy blocker.

## Current

- Current version: `10.11.0`
- Latest version: `10.12.0`

## Proposed Fix

```bash
cd client && npm install --save-dev eslint@10.12.0
```

## Acceptance Criteria

- [ ] `client/package.json` references `^10.12.0`
- [ ] `npm run build:client` (from repo root) succeeds
- [ ] `cd client && npx eslint .` runs without new errors

## Notes

- Tracked previously in `116` (complete) — this is the next bump.
