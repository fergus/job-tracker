# Upgrade `better-sqlite3` 13.0.3 → 13.1.1 (server)

- **Priority:** p3
- **Created:** 2026-11-13
- **Category:** Maintenance (npm, server, native module)

## Problem

`npm outdated` in `server/` reports a minor bump for `better-sqlite3`. The weekly
dependency job only auto-applies patch-level updates (same `major.minor`), so
this was flagged rather than installed.

`better-sqlite3` is the whole persistence layer — `server/db.js` opens the WAL
database with it and every query in the app goes through its prepared
statements. It is also a **native module**, so the bump is not a pure JavaScript
change: the compiled binding has to match the Node ABI of the runtime image.

## Current

- `better-sqlite3`: 13.0.3 (declared `^13.0.3`, `server/` dependencies)
- Latest: **13.1.1**
- Bump type: minor (13.0 → 13.1), not automatically applied
- Platform: built inside `node:26-alpine` (see `Dockerfile`), so the rebuild
  happens during the image build, not on the host

## Why it was not auto-applied

Minor bumps can carry behaviour changes in SQLite itself (the bundled SQLite
amalgamation version moves with these releases) and in the binding's
`Statement`/`Database` surface. Patch-level is the agreed automation boundary;
minor needs a human to read the release notes.

## Proposed Solution

```bash
cd server
npm install better-sqlite3@13.1.1
npm rebuild better-sqlite3
npm test                      # 558 tests at time of writing
cd .. && npm run build:client
```

Then read the release notes for the bundled SQLite version change and confirm
nothing in `server/db.js` relies on behaviour that moved:

- WAL mode / `journal_mode` pragma
- `user_version` handling around the `_migrations` table
- `affectedRows` / `lastInsertRowid` shapes used by the service layer

## Acceptance Criteria

- [ ] `cd server && npm ls better-sqlite3` resolves to 13.1.1
- [ ] `npm rebuild better-sqlite3` succeeds on the dev Node version
- [ ] `cd server && npm test` passes (558 tests)
- [ ] `npm run build:client` succeeds from the repo root
- [ ] Docker image builds on `node:26-alpine` and the container reports healthy
      after deploy

- **Effort**: Small | **Risk**: Medium (native module + SQLite version move)
