# Upgrade @playwright/test 1.63.0 → 1.64.0 (minor, client dev)

- **Priority:** p3
- **Created:** 2026-10-09
- **Category:** npm dependency (client, devDependency)

## Problem

`@playwright/test` is at `1.63.0` in `client/devDependencies`. Latest is
`1.64.0` (minor bump, same major). It drives the frontend E2E suite in
`client/e2e/`, run in CI after the client build. Not auto-applied.

## Current

- Current version: `1.63.0`
- Latest version: `1.64.0`

## Proposed Fix

```bash
cd client && npm install --save-dev @playwright/test@1.64.0
```

The Playwright browser binaries are version-pinned to the package, so after
upgrading, refresh them:

```bash
cd client && npx playwright install --with-deps chromium
```

## Acceptance Criteria

- [ ] `client/package.json` references `^1.64.0`
- [ ] `cd client && npx playwright install --with-deps chromium` succeeds
- [ ] `npm run build:client` (from repo root) succeeds
- [ ] `cd client && npm run test:e2e` passes (or note any spec updates needed)

## Notes

- Tracked previously in `078`, `088`, `112` (all complete) — this is the next bump.
- CI installs Playwright browsers itself, so the lockfile bump is enough for
  the pipeline; the local `install` step is only for running E2E by hand.
