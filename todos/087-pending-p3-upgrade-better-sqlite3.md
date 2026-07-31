# Upgrade better-sqlite3 (major)

- **Priority:** p3
- **Created:** 2026-07-31
- **Category:** Dependency

## Problem

`better-sqlite3` (server) is at version `12.11.1`. Latest is `13.0.2` (major bump).

## Current

`better-sqlite3@12.11.1`

## Target

`better-sqlite3@13.0.2`

## Proposed Fix

```bash
cd server && npm install better-sqlite3@13.0.2 && npm rebuild better-sqlite3
```

## Acceptance Criteria

- [ ] Server tests pass (`cd server && npm test`)
- [ ] Database operations work (WAL mode, prepared statements, migrations)
- [ ] No `ERR_DLOPEN_FAILED` on rebuild — confirm prebuilt binary for Node 20+/24 in Docker
