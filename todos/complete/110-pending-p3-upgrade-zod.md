# Upgrade zod 4.5.4 → 4.6.2 (minor, server)

- **Priority:** p3
- **Created:** 2026-09-11
- **Category:** npm dependency (server)

## Problem

`zod` is at `4.5.4` in `server/`. Latest is `4.6.2` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

This is the validation library used by the service layer, so schema/error behaviour is worth a re-test rather than a blind bump.

## Current

`zod@4.5.4` (server)

## Target

`zod@4.6.2`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install zod@4.6.2
```

## Acceptance Criteria

- [ ] `server/package.json` references `^4.6.2`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Validation error messages still surface correctly through the API — api tests assert 400 + error body on invalid payloads/statuses/dates

## Notes

- Previous zod upgrade: `todos/complete/101-pending-p3-upgrade-zod.md` (4.4.3 → 4.5.1).
