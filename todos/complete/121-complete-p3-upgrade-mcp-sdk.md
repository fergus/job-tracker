# Upgrade @modelcontextprotocol/sdk 1.30.1 to 1.31.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-09-30
- **Category:** npm dependency (server)

## Problem

`@modelcontextprotocol/sdk` is at 1.30.1. Latest is 1.31.0 (minor bump, same major). It was deferred on
2026-09-30 because 1.31.0 was published 2026-09-28T18:59Z, inside the 48-hour freshness window.
It runs the MCP server on port 3001, which faces the network behind API-key auth, so the changelog is worth reading for transport or session changes.

## Current

- Current version: 1.30.1
- Latest version: 1.31.0
- Safety: SLSA provenance present; published 2026-09-28T18:59Z

## Proposed Solutions

### Option A: Upgrade once the release is more than 48h old

```bash
cd server && npm install @modelcontextprotocol/sdk@1.31.0
```

Recheck `npm view @modelcontextprotocol/sdk time --json` for a newer patch first, and skim the
upstream changelog.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [x] Package upgraded to v1.31.0
- [x] Server tests pass (`cd server && npm test`)
- [x] An MCP client can still initialise a session and list tools
