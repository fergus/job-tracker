# Upgrade helmet (minor)

- **Priority:** p3
- **Created:** 2026-07-17
- **Category:** Dependency

## Problem

`helmet` (server) is at version `8.2.0`. Latest is `8.3.0` (minor bump).

## Current

`helmet@8.2.0`

## Target

`helmet@8.3.0`

## Proposed Fix

```bash
cd server && npm install helmet@8.3.0
```

## Acceptance Criteria

- [x] Server tests pass (`cd server && npm test`)
- [x] Security headers still applied correctly (CSP, HSTS, etc.)

## Completion
- Completed 2026-08-01: `helmet` upgraded 8.2.0 → 8.3.0 (server). All tests pass, audit clean.
