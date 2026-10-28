# Upgrade eslint 10.12.0 to 10.13.0 (minor, client)

- **Priority:** p3
- **Created:** 2026-10-16
- **Category:** npm dependency (client)

## Problem

`eslint` is pinned to `^10.12.0` in `client/` and 10.13.0 is now available. The
bump is minor, so the weekly dependency check deferred it rather than applying it
automatically.

## Current

- Current version: 10.12.0
- Latest version: 10.13.0
- Dev dependency in `client/package.json`

## Proposed Solutions

### Option A: Upgrade to 10.13.0

```bash
cd client && npm install -D eslint@10.13.0
cd .. && npm run build:client
```

Check whether the new minor adds lint rules that fire on existing code; if it
does, either fix the findings or pin the affected rule off deliberately.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [ ] `eslint` at 10.13.0 in `client/`
- [ ] `npm run build:client` succeeds
- [ ] Lint output on the client tree is clean (or deviations are intentional)
