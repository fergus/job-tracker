# Upgrade openai 7.32.0 to 7.35.0 (minor, server + client)

- **Priority:** p3
- **Created:** 2026-10-16
- **Category:** npm dependency (server + client)

## Problem

`openai` is pinned to `^7.32.0` in both `server/` and `client/`, and 7.35.0 is
now available. The bump spans three minor releases (7.32 -> 7.35), so it is
deferred rather than auto-applied — the weekly dependency check only auto-applies
patch-level updates.

This is the same package in both workspaces and should be moved in one change so
the two stay in lockstep.

## Current

- Current version: 7.32.0 (server and client)
- Latest version: 7.35.0
- Direct dependency in both `server/package.json` and `client/package.json`

## Proposed Solutions

### Option A: Upgrade both workspaces to 7.35.0

```bash
cd server && npm install openai@7.35.0 && npm test
cd client && npm install openai@7.35.0
cd .. && npm run build:client
```

Review the openai release notes for 7.33.0, 7.34.0 and 7.35.0 before applying;
the client build is what exercises the client-side usage.

- **Effort**: Small | **Risk**: Low-to-moderate (three minors of API surface)

## Acceptance Criteria

- [ ] `openai` at 7.35.0 in both `server/` and `client/`
- [ ] `cd server && npm test` passes
- [ ] `npm run build:client` succeeds
