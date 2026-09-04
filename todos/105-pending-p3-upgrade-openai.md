# Upgrade openai 7.8.0 → 7.10.0 (server + client)

- **Priority:** p3
- **Created:** 2026-09-04
- **Category:** npm dependency (server + client)

## Problem

`openai` is at `7.8.0` in both `server/` and `client/`. Latest is `7.10.0` (minor bump). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`openai@7.8.0` (server and client)

## Target

`openai@7.10.0` (server and client)

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install openai@7.10.0
cd /home/fstevens/code/job-tracker/client && npm install openai@7.10.0
```

## Acceptance Criteria

- [ ] `server/package.json` and `client/package.json` reference `^7.10.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Client builds (`npm run build:client`)
- [ ] AI features (JD extraction, document generation) still work
