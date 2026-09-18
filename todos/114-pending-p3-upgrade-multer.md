# Upgrade multer 2.3.0 → 2.4.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-09-19
- **Category:** npm dependency (server)

## Problem

`multer` is at `2.3.0` in `server/`. Latest is `2.4.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`multer@2.3.0` (server)

## Target

`multer@2.4.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install multer@2.4.0
```

## Acceptance Criteria

- [ ] `server/package.json` references `^2.4.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] CV/cover-letter upload still works (multipart create + update paths) — exercised by the supertest `.attach()` multipart tests against the real routes

## Notes

- Previous multer upgrades: `075` (p2, CVE fix) and `099` (2.2.0 → 2.3.0), both in `todos/complete/`.
- `npm audit` is currently clean in both trees, so this is a routine minor bump, not a security item.
