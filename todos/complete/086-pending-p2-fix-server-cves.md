# Fix server CVEs (fast-uri high, hono moderate, body-parser low)

- **Priority:** p2
- **Created:** 2026-07-24
- **Category:** Security

## Problem

`npm audit` on `server/` reports 5 vulnerabilities:

| Package | Severity | Type | Fix |
|---------|----------|------|-----|
| `fast-uri` | **HIGH** | Transitive (via @modelcontextprotocol/sdk → ajv) | Fixed in 3.1.4+ (latest 4.1.2) |
| `@hono/node-server` | moderate | Transitive (via @modelcontextprotocol/sdk) | Fixed in 2.0.5+ (latest 2.0.12) |
| `@modelcontextprotocol/sdk` | moderate | Direct | Fixed in 1.30.0 (minor bump, released 2026-07-30) |
| `hono` | moderate | Transitive (via @modelcontextprotocol/sdk) | Fixed in 4.12.27+ (latest 4.12.33) |
| `body-parser` | low | Transitive (via express) | Fixed in 2.3.0 (released) |

## Current

Various transitive dependencies in `server/node_modules/`:

- `fast-uri@3.0.0-3.1.3` — host confusion via backslash authority delimiter (GHSA-v2hh-gcrm-f6hx) and failed IDN canonicalization (GHSA-4c8g-83qw-93j6)
- `@hono/node-server@<2.0.5` — path traversal on Windows (GHSA-frvp-7c67-39w9)
- `@modelcontextprotocol/sdk@>=1.25.0` — affected via @hono/node-server dependency
- `hono@4.0.0-4.12.26` — 3 moderate issues (request header dedup, JSX context isolation, JSX XSS)
- `body-parser@2.0.0-2.2.2` — DoS via invalid limit value (GHSA-v422-hmwv-36x6)

## Target

All CVEs resolved

## Proposed Fix

Upgrade `@modelcontextprotocol/sdk` to `1.30.0` (minor bump, **not** auto-applied in cron mode — needs review):

```bash
cd server && npm install @modelcontextprotocol/sdk@1.30.0
```

SDK 1.30.0's dependency ranges resolve all patched versions on a fresh install:
- `hono ^4.11.4` → 4.12.33 (fixes 3 moderate advisories)
- `@hono/node-server ^1.19.9 || ^2.0.5` → 2.0.12 (fixes path traversal)
- `fast-uri` via `ajv ^3.0.1` → 3.1.5 (fixes both high advisories)
- `body-parser` via `express ^2.2.1` → 2.3.0 (fixes low DoS)

## Notes

- Updated 2026-07-31: SDK 1.30.0 is now released; earlier analysis suggested a 1.25.x → 1.24.3 downgrade, but 1.30.0 resolves the whole tree with a minor bump
- Verify MCP server still functions after upgrade (Streamable HTTP transport, all 8 tools)
- Client audit is clean (0 vulnerabilities)

## Acceptance Criteria

- [x] `cd server && npm audit` reports 0 vulnerabilities
- [x] Server tests pass (`cd server && npm test`)
- [x] MCP server still functions correctly

## Completion
- Completed 2026-08-01: `@modelcontextprotocol/sdk` upgraded to 1.30.0, then `npm audit fix` resolved the rest of the tree: hono 4.12.33, @hono/node-server 2.0.12, fast-uri 3.1.5, body-parser 2.3.0. Server audit now reports **0 vulnerabilities**. All 201 server tests pass.
