# Upgrade openai 7.23.0 → 7.27.0 (minor, server + client)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** npm dependency (server + client)

## Problem

The `openai` SDK is at `7.23.0` in **both** `server/` and `client/`. Latest is
`7.27.0` (minor bump, same major). Not auto-applied — the weekly check only
auto-applies patch-level bumps.

## Current

- Current version: `7.23.0` (server and client)
- Latest version: `7.27.0`

## Proposed Fix

```bash
cd server && npm install openai@7.27.0
cd client && npm install openai@7.27.0
```

Skim the upstream changelog (`https://github.com/openai/openai-node/releases`)
for breaking behaviour in the 7.24–7.27 range before upgrading.

## Acceptance Criteria

- [ ] `server/package.json` and `client/package.json` reference `^7.27.0`
- [ ] `cd server && npm test` passes
- [ ] `npm run build:client` (from repo root) succeeds
- [ ] Document generation / AI endpoints still work

## Notes

- Tracked previously in `100`, `105`, `109` (all now complete) — this is the next bump.
