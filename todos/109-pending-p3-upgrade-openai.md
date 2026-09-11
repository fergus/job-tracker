# Upgrade openai 7.10.0 → 7.15.0 (minor, server + client)

- **Priority:** p3
- **Created:** 2026-09-11
- **Category:** npm dependency (server + client)

## Problem

`openai` is pinned at `^7.10.0` in **both** `server/` and `client/`. Latest is `7.15.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`openai@7.10.0` (server + client)

## Target

`openai@7.15.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install openai@7.15.0
cd /home/fstevens/code/job-tracker/client && npm install openai@7.15.0
```

## Acceptance Criteria

- [ ] `server/package.json` and `client/package.json` reference `^7.15.0`
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Client builds clean (`npm run build:client` from repo root)
- [ ] AI-assisted features (document generation / job-description extraction) still work — the SDK is used for chat completions, so verify a smoke call or the relevant tests

## Notes

- Previous openai upgrade todos: `094`, `095`, `100`, `105` (all in `todos/complete/`) — this project tracks openai closely because it moves fast on minors.
- One todo covers both trees deliberately: it is the same package and version in a single repo.
