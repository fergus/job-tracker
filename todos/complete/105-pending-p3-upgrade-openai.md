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

- [x] `server/package.json` and `client/package.json` reference `^7.10.0`
- [x] Server tests pass (`cd server && npm test`)
- [x] Client builds (`npm run build:client`)
- [x] AI features (JD extraction, document generation) still work

## Completion
- Completed 2026-09-08: `openai@7.10.0` installed in `server/` and `client/`; both package.json files reference `^7.10.0`. Server tests 345 pass / 0 fail, `npm run build:client` succeeds.
