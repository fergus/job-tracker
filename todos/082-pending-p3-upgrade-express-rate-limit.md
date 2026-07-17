# Upgrade express-rate-limit (minor)

- **Priority:** p3
- **Created:** 2026-07-17
- **Category:** Dependency

## Problem

`express-rate-limit` (server) is at version `8.5.2`. Latest is `8.6.0` (minor bump).

## Current

`express-rate-limit@8.5.2`

## Target

`express-rate-limit@8.6.0`

## Proposed Fix

```bash
cd server && npm install express-rate-limit@8.6.0
```

## Acceptance Criteria

- [ ] Server tests pass (`cd server && npm test`)
- [ ] Rate limiting still functions correctly (default 100 req/min on `/api`)
