# Upgrade openai to 7.4.0 (minor)

- **Priority:** p3
- **Created:** 2026-08-14
- **Category:** Dependency bump

## Problem

`npm outdated` shows `openai` at 7.3.0 in **both** `server/` and `client/` (single package, two locations — one todo).

| Location | Current | Wanted | Latest |
|----------|---------|--------|--------|
| server/ | 7.3.0 | 7.4.0 | 7.4.0 |
| client/ | 7.3.0 | 7.4.0 | 7.4.0 |

## Current

- `openai@7.3.0` in server/ and client/

## Target

- `openai@7.4.0` in both

## Proposed Fix

```bash
cd server && npm install openai@7.4.0
cd client && npm install openai@7.4.0
```

Minor bump (7.3.x → 7.4.x), NOT auto-applied in cron mode.

## Notes

- Created 2026-08-14 during weekly dep check

## Acceptance Criteria

- [ ] `cd server && npm outdated` shows openai current
- [ ] `cd client && npm outdated` shows openai current
- [ ] Server tests pass (`cd server && npm test`)
- [ ] Client builds (`npm run build:client` from project root)
