# Upgrade openai 7.32.0 to 7.43.0 (minor, server + client)

- **Priority:** p3
- **Created:** 2026-10-16
- **Updated:** 2026-10-23 (weekly dep check; latest moved 7.35.0 → 7.43.0)
- **Category:** npm dependency (server + client)

## Problem

`openai` is pinned to `^7.32.0` in both `server/` and `client/`, and 7.43.0 is
now available. The bump spans eleven minor releases (7.32 → 7.43), so it is
deferred rather than auto-applied — the weekly dependency check only auto-applies
patch-level updates.

This is the same package in both workspaces and should be moved in one change so
the two stay in lockstep.

## Current

- Current version: 7.32.0 (server and client)
- Latest version: 7.43.0
- Direct dependency in both `server/package.json` and `client/package.json`

## Proposed Solutions

### Option A: Upgrade both workspaces to 7.43.0

```bash
cd server && npm install openai@7.43.0 && npm test
cd client && npm install openai@7.43.0
cd .. && npm run build:client
```

Review the openai release notes across 7.33.0 → 7.43.0 before applying. Eleven
minors is enough surface that at least one deprecation or signature change is
likely; the server test suite and the client build are what exercise both usages.

### Option B: Step the upgrade in stages

If the full jump produces failures that are hard to attribute, bisect — move to
7.38.0 first, verify, then to latest. Slower but makes a breakage obvious.

- **Effort**: Small | **Risk**: Moderate (eleven minors of API surface)

## Acceptance Criteria

- [ ] `openai` at 7.43.0 in both `server/` and `client/`
- [ ] `cd server && npm test` passes
- [ ] `npm run build:client` succeeds
- [ ] Document generation (`generate_document` MCP tool) still returns a document
