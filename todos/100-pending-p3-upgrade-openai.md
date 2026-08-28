# Upgrade openai 7.5.0 → 7.8.0

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** npm dependency (server + client)

## Problem

`openai` is at `7.5.0` in both `server/` and `client/`. Latest is `7.8.0` (minor bump). Minor bumps are not auto-applied by the weekly dependency check. Worth checking the changelog for breaking changes before bumping — this package has historically moved fast.

## Current

`openai@7.5.0` (server + client)

## Target

`openai@7.8.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install openai@7.8.0
cd /home/fstevens/code/job-tracker/client && npm install openai@7.8.0
```

## Acceptance Criteria

- [ ] Both `server/package.json` and `client/package.json` reference `^7.8.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Client builds (`npm run build:client`)
- [ ] AI-assisted features (job description extraction, document generation) still work
