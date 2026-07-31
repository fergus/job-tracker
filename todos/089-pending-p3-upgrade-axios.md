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

- [ ] Client builds successfully (`npm run build:client`)
- [ ] API calls work in the SPA (list, create, update, status change, notes)
