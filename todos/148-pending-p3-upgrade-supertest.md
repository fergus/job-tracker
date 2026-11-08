# Upgrade `supertest` 7.3.1 → 7.3.2 (patch, server dev)

- **Priority:** p3
- **Created:** 2026-11-08
- **Category:** Maintenance (npm, server dev tooling)

## Problem

`npm outdated` in `server/` reports a patch bump for `supertest`, the HTTP
assertion library the backend test suite (`server/test/api.test.js`) uses.
Not auto-applied: the dependency job never applies npm updates, patch-level
included, because supply-chain compromises often ship in patch releases.

Dev-only: not part of the shipped image, no runtime or security impact, no
advisory attached.

## Current

- `supertest`: 7.3.1 (server devDependencies)
- Latest: **7.3.2**, published 2026-11-07T09:08Z, about 32 hours before this
  check, so it is **fresh (<48h)**. Prefer to wait until it is at least two
  days old and nothing has been reported against it.
- Publisher provenance: not checked (unknown).

## Proposed Solution

```bash
cd server && npm install -D supertest@7.3.2
npm rebuild better-sqlite3 && npm test
```

## Acceptance Criteria

- [ ] `cd server && npm ls supertest` resolves to 7.3.2
- [ ] `cd server && npm test` passes
- [ ] Only `server/package.json` and `server/package-lock.json` change

- **Effort**: Small | **Risk**: Low (dev dependency; verified by the test suite)
