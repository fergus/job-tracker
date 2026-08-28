# Upgrade zod 4.4.3 → 4.5.1

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** npm dependency (server)

## Problem

`zod` is at `4.4.3` in `server/`. Latest is `4.5.1` (minor bump — validation library used by the service layer). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`zod@4.4.3` (server)

## Target

`zod@4.5.1`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install zod@4.5.1
```

## Acceptance Criteria

- [ ] `server/package.json` references `^4.5.1`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Validation error messages still surface correctly through the API
