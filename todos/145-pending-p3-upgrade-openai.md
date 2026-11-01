# Upgrade openai 7.45.1 to 7.47.0 (minor, both)

- **Priority:** p3
- **Created:** 2026-11-01
- **Category:** npm dependency (both)

## Problem

`npm outdated` reports `openai` two minors behind in both `server/` and
`client/` (declared `^7.45.1`). No CVE.

## Current

- Current version: 7.45.1 (server and client)
- Latest version: 7.47.0 (published 2026-10-31, about 1 day old at time of check)
- Safety: npm provenance and signatures present

## Proposed Solutions

### Option A: Upgrade now

```bash
cd server && npm install openai@7.47.0
cd ../client && npm install openai@7.47.0
```

Run `cd server && npm test` and `npm run build:client`, then release.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [ ] `openai` at 7.47.0 in `server/` and `client/`
- [ ] Server tests pass and client build succeeds
