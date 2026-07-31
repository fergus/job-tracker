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

- [ ] Server tests pass (`cd server && npm test`)
- [ ] OpenAI API calls still work (MCP server integration)
- [ ] Client builds successfully
