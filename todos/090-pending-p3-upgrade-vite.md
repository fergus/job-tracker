# Upgrade vite (minor)

- **Priority:** p3
- **Created:** 2026-07-31
- **Category:** Dependency

## Problem

`vite` (client, devDependency) is at version `8.1.5`. Latest is `8.2.0` (minor bump).

## Current

`vite@8.1.5`

## Target

`vite@8.2.0`

## Proposed Fix

```bash
cd client && npm install -D vite@8.2.0
```

## Acceptance Criteria

- [ ] Client builds successfully (`npm run build:client`)
- [ ] Dev server starts on :5173 and proxies `/api` to :3000
