# Upgrade @playwright/test 1.62.1 → 1.63.0 (minor, client devDependency)

- **Priority:** p3
- **Created:** 2026-09-11
- **Category:** npm dependency (client, dev)

## Problem

`@playwright/test` is at `1.62.1` in `client/` (devDependency). Latest is `1.63.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

Playwright minor bumps usually ship a new browser build, so the browser binaries must be re-installed locally before E2E runs.

## Current

`@playwright/test@1.62.1` (client, devDependency)

## Target

`@playwright/test@1.63.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/client && npm install -D @playwright/test@1.63.0
cd /home/fstevens/code/job-tracker/client && npx playwright install --with-deps
```

## Acceptance Criteria

- [ ] `client/package.json` references `^1.63.0`
- [ ] `npx playwright install` run for the new browser build
- [ ] Client E2E tests pass (`npm run build:client && cd client && npm run test:e2e`)
- [ ] No breaking changes in the Playwright API (specs still run unmodified)

## Notes

- Previous Playwright upgrades: `078`, `088` (both in `todos/complete/`) — the same one-ever-two-weeks cadence, minor only.
