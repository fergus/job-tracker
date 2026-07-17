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

- [ ] Server tests pass (`cd server && npm test`)
- [ ] Security headers still applied correctly (CSP, HSTS, etc.)
