# Upgrade `@playwright/test` 1.64.1 → 1.65.0 (client, dev)

- **Priority:** p3
- **Created:** 2026-11-06
- **Category:** Maintenance (npm, client dev tooling)

## Problem

`npm outdated` in `client/` reports a minor bump for `@playwright/test`. Not
applied automatically — Playwright minors ship with a matching browser build, so
the bump pairs a package update with a browser download that CI has to perform.

Dev-only: it is not part of the shipped image and has no runtime or security
impact.

## Current

- `@playwright/test`: 1.64.1 (declared `^1.64.1`, `client/` devDependencies)
- Latest: **1.65.0**

## Proposed Solution

```bash
cd client && npm install -D @playwright/test@1.65.0
npx playwright install --with-deps chromium
cd .. && npm run build:client && cd client && npm run test:e2e
```

The E2E suite is the real gate here: a Playwright minor can change locator
strictness, auto-waiting or trace defaults, and the job-tracker E2E tests are
explicitly there to catch DOM/transition issues that unit tests miss.

CI installs browsers from the lockfile-pinned version, so the
`npm ci && npx playwright install` step in `.github/workflows/build.yml` needs no
edit — but confirm the test job goes green on the release that carries this bump
rather than assuming it.

## Acceptance Criteria

- [ ] `cd client && npm ls @playwright/test` resolves to 1.65.0
- [ ] `npm run test:e2e` passes against a freshly built client
- [ ] CI test job passes on the tag release carrying the bump
- [ ] Only `client/package.json` and `client/package-lock.json` change for the package itself

- **Effort**: Small | **Risk**: Low (dev dependency; E2E suite is the gate)
