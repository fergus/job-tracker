# Upgrade zod 4.6.5 to 4.6.6 (patch, server)

- **Priority:** p3
- **Created:** 2026-10-12
- **Category:** npm dependency (server)

## Problem

`zod` is at 4.6.5 in `server/`; 4.6.6 is out. Deferred on 2026-10-12 because
the release was about a day old, under the 48-hour freshness window.

## Current

- Current version: 4.6.5
- Latest version: 4.6.6
- Safety: has npm provenance; published 2026-10-11T16:18Z

## Proposed Solutions

### Option A: Upgrade once the release is more than 48h old

Run `cd server && npm install zod@4.6.6`, then `npm test`.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [ ] zod upgraded to 4.6.6
- [ ] `cd server && npm test` passes
