# Upgrade axios (minor)

- **Priority:** p3
- **Created:** 2026-07-31
- **Category:** Dependency

## Problem

`axios` (client) is at version `1.18.1`. Latest is `1.19.0` (minor bump).

## Current

`axios@1.18.1`

## Target

`axios@1.19.0`

## Proposed Fix

```bash
cd client && npm install axios@1.19.0
```

## Acceptance Criteria

- [x] Client builds successfully (`npm run build:client`)
- [x] API calls work in the SPA (list, create, update, status change, notes)

## Completion
- Completed 2026-08-01: `axios` upgraded 1.18.1 → 1.19.0 (client). Client builds clean, unit tests pass.
