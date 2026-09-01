# Upgrade morgan 1.11.0 → 1.12.0

- **Priority:** p3
- **Created:** 2026-08-28
- **Category:** npm dependency (server + client)

## Problem

`morgan` is at `1.11.0` in both `server/` and `client/`. Latest is `1.12.0` (minor bump). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`morgan@1.11.0` (server + client)

## Target

`morgan@1.12.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install morgan@1.12.0
cd /home/fstevens/code/job-tracker/client && npm install morgan@1.12.0
```

## Acceptance Criteria

- [x] Both `server/package.json` and `client/package.json` reference `^1.12.0`
- [x] Server tests pass (`cd server && npm test`)
- [x] Client builds (`npm run build:client`)

## Completion
- Completed 2026-09-01: upgraded morgan 1.11.0 → 1.12.0 in both `server/` and `client/`. Verification: server tests 345/345 pass, client build succeeds, `npm audit` reports 0 vulnerabilities in both workspaces.
