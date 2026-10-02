# Upgrade globals 17.12.0 → 17.13.0 (minor, client dev)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** npm dependency (client, devDependency)

## Problem

`globals` is at `17.12.0` in `client/devDependencies`. Latest is `17.13.0` (minor
bump, same major). It supplies the eslint global-name lists; build tooling only.

## Current

- Current version: `17.12.0`
- Latest version: `17.13.0`

## Proposed Fix

```bash
cd client && npm install --save-dev globals@17.13.0
```

## Acceptance Criteria

- [ ] `client/package.json` references `^17.13.0`
- [ ] `cd client && npx eslint .` runs without new errors
- [ ] `npm run build:client` (from repo root) succeeds
