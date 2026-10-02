# Upgrade @modelcontextprotocol/sdk 1.30.1 → 1.32.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-10-03
- **Category:** npm dependency (server)

## Problem

`@modelcontextprotocol/sdk` is at `1.30.1` in `server/`. Latest is `1.32.0`
(minor bump, same major). It backs the MCP server on port 3001, so a change here
touches the Streamable HTTP transport, session handling and tool schemas.

## Current

- Current version: `1.30.1`
- Latest version: `1.32.0`

## Proposed Fix

```bash
cd server && npm install @modelcontextprotocol/sdk@1.32.0
```

Then re-check `ajv`/`fast-uri` and `hono`/`@hono/node-server` transitive
versions — this package is the parent of both trees and has historically pulled
new CVEs forward (see `108-pending-p2-upgrade-hono-cves.md`). Upgrade this
*after* or *alongside* `121-pending-p2-server-cves-fast-uri-ip-address.md`.

## Acceptance Criteria

- [ ] `server/package.json` references `^1.32.0`
- [ ] `cd server && npm test` passes
- [ ] MCP smoke test: initialize returns a session id, `tools/list` returns the
      full tool set, `list_applications` and `create_application` succeed
- [ ] `npm audit` still reports 0 vulnerabilities

## Notes

- Tracked previously in `108` — this is the next bump past the CVE-cleared 1.30.x line.
