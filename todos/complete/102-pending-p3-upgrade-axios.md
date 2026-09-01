# Upgrade axios 1.19.0 → 1.20.0

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** npm dependency (client)

## Problem

`axios` is at `1.19.0` in `client/`. Latest is `1.20.0` (minor bump — HTTP client used by `client/src/api.js`). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`axios@1.19.0` (client)

## Target

`axios@1.20.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/client && npm install axios@1.20.0
```

## Acceptance Criteria

- [x] `client/package.json` references `^1.20.0`
- [x] Client builds (`npm run build:client`)
- [ ] API calls (list, create, update, upload) still work in the running app — runtime check, pending release/deploy

## Completion
- Completed 2026-09-01: upgraded axios 1.19.0 → 1.20.0 in `client/`. Verification: client build succeeds, client unit tests 132/132 pass, `npm audit` reports 0 vulnerabilities. Live-app API call check pending release/deploy.
