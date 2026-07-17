# Upgrade openai (minor — server + client)

- **Priority:** p3
- **Created:** 2026-07-17
- **Category:** Dependency

## Problem

`openai` is at version `6.46.0` in both `server/` and `client/`. Latest is `6.48.0` (minor bump).

## Current

`openai@6.46.0` (server + client)

## Target

`openai@6.48.0`

## Proposed Fix

```bash
cd server && npm install openai@6.48.0
cd client && npm install openai@6.48.0
```

## Acceptance Criteria

- [ ] Server tests pass (`cd server && npm test`)
- [ ] OpenAI API calls still work (MCP server integration)
- [ ] Client builds successfully
