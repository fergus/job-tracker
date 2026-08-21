# Upgrade openai 7.4.0 → 7.5.0 (minor)

- **Priority:** p3
- **Created:** 2026-08-21
- **Category:** npm dependency (server + client)

## Problem

`openai` is on a minor bump in both dependency trees. Minor bumps are not auto-applied by the weekly dependency check — requires human review of breaking changes.

## Current

`openai@7.4.0` in both `server/package.json` and `client/package.json` (`^7.4.0`)

## Target

`openai@7.5.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install openai@7.5.0
cd /home/fstevens/code/job-tracker/client && npm install openai@7.5.0
```

## Acceptance Criteria

- [ ] `npm outdated` shows no `openai` entry in server/ or client/
- [ ] `cd server && npm test` passes
- [ ] `npm run build:client` (from project root) passes
- [ ] MCP tools still respond correctly (openai is used by the job-tracker agent tooling)
