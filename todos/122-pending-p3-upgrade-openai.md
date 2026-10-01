# Upgrade openai 7.23.0 to 7.25.0 (minor, both)

- **Priority:** p3
- **Created:** 2026-09-30
- **Category:** npm dependency (both)

## Problem

`openai` is at 7.23.0. Latest is 7.25.0 (minor bump, same major). It was deferred on
2026-09-30 because 7.25.0 was published 2026-09-29T19:16Z, inside the 48-hour freshness window.
It is a direct dependency of both server and client, so bump both together.

## Current

- Current version: 7.23.0
- Latest version: 7.25.0
- Safety: SLSA provenance present; published 2026-09-29T19:16Z

## Proposed Solutions

### Option A: Upgrade once the release is more than 48h old

```bash
cd server && npm install openai@7.25.0
cd client && npm install openai@7.25.0
```

Recheck `npm view openai time --json` for a newer patch first, and skim the
upstream changelog.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [ ] Package upgraded to v7.25.0
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Client builds clean (`npm run build:client` from repo root)
