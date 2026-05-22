# Pending: Upgrade openai 6.38.0 → 6.39.0 (minor)
**Created:** 2026-05-22
**Priority:** P3 (minor bump, routine)
**Status:** pending
**Module:** server

## What
`openai` has a minor update available: `6.38.0` → `6.39.0`.

## Action
Review the [openai-node changelog](https://github.com/openai/openai-node/releases) for any breaking changes, then run:
```bash
cd server && npm install openai@6.39.0
```

This is used by the MCP job description extraction. Verify extraction still works after update.
