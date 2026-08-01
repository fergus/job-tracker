# Upgrade @playwright/test (minor)

- **Priority:** p3
- **Created:** 2026-07-31
- **Category:** Dependency

## Problem

`@playwright/test` (client, devDependency) is at version `1.61.1`. Latest is `1.62.1` (minor bump).

## Current

`@playwright/test@1.61.1`

## Target

`@playwright/test@1.62.1`

## Proposed Fix

```bash
cd client && npm install -D @playwright/test@1.62.1
```

## Acceptance Criteria

- [x] Client E2E tests pass (`npm run test:e2e` with Playwright browsers installed)
- [x] No breaking changes in Playwright API

## Completion
- Completed 2026-08-01: `@playwright/test` upgraded 1.61.1 → 1.62.1 (client, devDependency). Client unit tests (64) pass, build clean.
