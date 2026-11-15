# Upgrade `dompurify` 3.4.17 → 3.4.18 (client)

- **Priority:** p3
- **Created:** 2026-11-15
- **Category:** Maintenance (npm, client)

## Problem

`npm outdated` in `client/` reports a patch bump for `dompurify`. The weekly
unattended run does not apply any update, patch bumps included, so it is
recorded here.

`dompurify` sanitises the rendered markdown (`marked` output) in the SPA, so it
is a security-relevant library: read the 3.4.18 release notes first, and if it
fixes a sanitiser bypass, raise this to p2.

## Proposed Solution

```bash
cd client && npm install dompurify@3.4.18
cd .. && npm run build:client && cd client && npm run test:e2e
```

- **Effort**: Small | **Risk**: Low (patch release)

## Acceptance Criteria

- [ ] `cd client && npm ls dompurify` shows 3.4.18
- [ ] `npm run build:client` succeeds
- [ ] E2E tests pass
