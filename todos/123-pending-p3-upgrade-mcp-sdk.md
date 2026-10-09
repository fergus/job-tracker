# Upgrade @modelcontextprotocol/sdk 1.30.1 → 1.32.1 (minor + high CVE, server)

- **Priority:** p3
- **Created:** 2026-10-03
- **Updated:** 2026-10-09
- **Category:** npm dependency (server)

## Problem

`@modelcontextprotocol/sdk` is at `1.30.1` in `server/`. Latest is `1.32.1`
(minor bump, same major). It backs the MCP server on port 3001, so a change
here touches the Streamable HTTP transport, session handling and tool schemas.

The current version also carries a **high**-severity advisory that the bump
clears.

## Current

- Current version: `1.30.1`
- Latest version: `1.32.1`
- Advisory: GHSA-6qxp-vccf-f47h — OAuth client could send credentials to an
  authorization server chosen by the MCP server (CVSS 7.5, fixed in `>=1.31.0`)

## Proposed Fix

```bash
cd server && npm install @modelcontextprotocol/sdk@1.32.1
```

Then re-check `ajv`/`fast-uri` and `hono`/`@hono/node-server` transitive
versions — this package is the parent of both trees and has historically pulled
new CVEs forward (see `108-pending-p2-upgrade-hono-cves.md`). Upgrade this
*after* or *alongside* `121-pending-p2-server-cves-fast-uri-ip-address.md`.

## Acceptance Criteria

- [ ] `server/package.json` references `^1.32.1`
- [ ] `cd server && npm test` passes
- [ ] MCP smoke test: initialize returns a session id, `tools/list` returns the
      full tool set, `list_applications` and `create_application` succeed
- [ ] `npm audit` no longer lists `@modelcontextprotocol/sdk`

## Notes

- Bumped from `1.32.0` to `1.32.1` on 2026-10-09 (patch released upstream).
- Tracked previously in `108` — this is the next bump past the CVE-cleared 1.30.x line.
