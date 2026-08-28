# Upgrade multer 2.2.0 → 2.3.0

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** npm dependency (server)

## Problem

`multer` is at `2.2.0` in `server/`. Latest is `2.3.0` (minor bump — multipart/form-data uploads). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`multer@2.2.0` (server)

## Target

`multer@2.3.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install multer@2.3.0
```

## Acceptance Criteria

- [ ] `server/package.json` references `^2.3.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] CV/cover-letter upload still works (multipart create + update paths)
