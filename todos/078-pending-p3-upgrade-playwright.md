# Upgrade @playwright/test (client, devDependency)

**Priority:** p3 (minor bump, dev dependency)

## Problem

`@playwright/test` is at v1.60.0, latest is v1.61.0 (minor bump).

## Current vs Latest

| Package | Current | Latest | Type |
|---------|---------|--------|------|
| `@playwright/test` (client, dev) | 1.60.0 | 1.61.0 | minor |

## Proposed fix

```sh
cd client && npm install @playwright/test@1.61.0
```

## Acceptance criteria

- [ ] Install succeeds without errors
- [ ] `npm run test:e2e` passes (requires browser)
- [ ] No breaking changes in Playwright API

## Notes

Dev dependency only — affects test environment, not production.
