# Upgrade globals 17.13.0 to 17.14.0 (minor, client)

- **Priority:** p3
- **Created:** 2026-11-01
- **Category:** npm dependency (client, dev-only)

## Problem

`npm outdated` in `client/` reports `globals` one minor behind (declared
`^17.13.0`). Dev-only, used by the ESLint flat config. No CVE.

## Current

- Current version: 17.13.0
- Latest version: 17.14.0
- Safety: **fresh** - published 2026-11-01, under 48 hours old at time of check.
  Wait until it has aged before applying.

## Proposed Solutions

### Option A: Upgrade after 48h, together with ESLint (todo 142)

```bash
cd client && npm install -D globals@17.14.0
```

Run lint and `npm run build:client`.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [ ] `globals` at 17.14.0
- [ ] Lint passes and client build succeeds
