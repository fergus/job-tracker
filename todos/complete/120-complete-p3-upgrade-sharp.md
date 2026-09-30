# Upgrade sharp 0.35.4 to 0.35.5 (patch, client dev)

- **Priority:** p3
- **Created:** 2026-09-27
- **Category:** npm dependency (client, devDependency)

## Problem

`sharp` is at `^0.35.4` in `client/devDependencies`. Latest is `0.35.5` (patch
bump). It was deferred on 2026-09-27 because 0.35.5 was published the same day
(2026-09-27T13:46Z), inside the 48-hour freshness window. It does carry an SLSA
provenance attestation, and it is build tooling only.

## Current

- Current version: 0.35.4
- Latest version: 0.35.5
- Safety: SLSA provenance present; published 2026-09-27T13:46Z (under 12h old at time of check)

## Proposed Solutions

### Option A: Upgrade once the release is more than 48h old

```bash
cd client && npm install --save-dev sharp@0.35.5
```

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [x] `client/package.json` references `^0.35.5`
- [x] Client builds clean (`npm run build:client` from repo root)
