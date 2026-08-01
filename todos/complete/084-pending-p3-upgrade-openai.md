# Upgrade openai (major — server + client)

- **Priority:** p3
- **Created:** 2026-07-17
- **Updated:** 2026-07-31
- **Category:** Dependency

## Problem

`openai` is at version `6.46.0` in both `server/` and `client/`. Latest is `7.3.0` (major bump); `6.49.0` is the newest minor on the 6.x track.

## Current

`openai@6.46.0` (server + client)

## Target

`openai@7.3.0`

## Proposed Fix

```bash
cd server && npm install openai@7.3.0
cd client && npm install openai@7.3.0
```

Check for breaking changes in the 7.x migration guide before applying.

## Acceptance Criteria

- [x] Server tests pass (`cd server && npm test`)
- [x] OpenAI API calls still work (MCP server integration)
- [x] Client builds successfully

## Completion
- Completed 2026-08-01: `openai` upgraded 6.46.0 → 7.3.0 (server + client). Reviewed v7 migration guide — codebase only uses `new OpenAI({apiKey})` + `chat.completions.create()`, unaffected by breaking changes. All tests pass, builds clean, audits clean.
