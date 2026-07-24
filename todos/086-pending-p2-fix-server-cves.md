# Fix server CVEs (fast-uri high, hono moderate, body-parser low)

- **Priority:** p2
- **Created:** 2026-07-24
- **Category:** Security

## Problem

`npm audit` on `server/` reports 5 vulnerabilities:

| Package | Severity | Type | Fix |
|---------|----------|------|-----|
| `fast-uri` | **HIGH** | Transitive | `fixAvailable: true` (minor) |
| `@hono/node-server` | moderate | Transitive (via @modelcontextprotocol/sdk) | Needs @modelcontextprotocol/sdk upgrade |
| `@modelcontextprotocol/sdk` | moderate | Direct | Major version fix (1.25.x → 1.24.3 — downgrade) |
| `hono` | moderate | Transitive (via @modelcontextprotocol/sdk) | `fixAvailable: true` |
| `body-parser` | low | Transitive (via express) | `fixAvailable: true` |

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

Evaluate in order:

1. Try `npm audit fix` to resolve fast-uri, hono, and body-parser (which have `fixAvailable: true` without major bumps)
2. For @modelcontextprotocol/sdk and @hono/node-server: investigate upgrading to a version with patched dependencies

## Notes

- `fast-uri` is a transitive dep of `@modelcontextprotocol/sdk` (via `hono`) and possibly other packages
- The `@modelcontextprotocol/sdk` CVE fix involves rolling back from 1.25.x to 1.24.3 (isSemVerMajor). Investigate if a newer version (1.26+) resolves both the @hono/node-server issue and maintains MCP SDK features
- Client audit is clean (0 vulnerabilities)

## Acceptance Criteria

- [ ] `cd server && npm audit` reports 0 vulnerabilities
- [ ] Server tests pass (`cd server && npm test`)
- [ ] MCP server still functions correctly
