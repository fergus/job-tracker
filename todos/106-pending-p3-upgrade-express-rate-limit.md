# Upgrade express-rate-limit 8.6.2 → 8.7.0

- **Priority:** p3
- **Created:** 2026-09-04
- **Category:** npm dependency (server)

## Problem

`express-rate-limit` is at `8.6.2` in `server/`. Latest is `8.7.0` (minor bump). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`express-rate-limit@8.6.2` (server)

## Target

`express-rate-limit@8.7.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install express-rate-limit@8.7.0
```

## Acceptance Criteria

- [ ] `server/package.json` references `^8.7.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Rate limiting still enforced on `/api` and upload endpoints
