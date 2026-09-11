# Fix hono CVEs (3 × moderate) via server override bump

- **Priority:** p2
- **Created:** 2026-09-11
- **Category:** Security

## Problem

`npm audit` on `server/` reports 1 vulnerable package (3 advisories) — all in `hono`, which is a **transitive** dependency of the MCP server stack:

`@modelcontextprotocol/sdk@1.30.0` → `hono@4.13.3` and → `@hono/node-server@2.0.12` → `hono@4.13.3` (deduped)

All three advisories are fixed in **hono 4.13.5+**. `server/package.json` already carries an `overrides` entry pinning `hono` — but only at `">=4.12.25"`, which is below the fixed range.

| Advisory | Severity | CVSS | Issue |
|----------|----------|------|-------|
| GHSA-gqvv-2mrq-wpjv | moderate | 6.5 | Incomplete fix for CVE-2026-39408 — `toSSG()` still writes files outside the output directory (CWE-22) |
| GHSA-g6gw-c38x-mqfc | moderate | 5.3 | Unbounded dot-notation nesting in `parseBody()` can cause memory exhaustion (CWE-400) |
| GHSA-crvj-82cr-hjcx | moderate | 5.9 | Query parser reads parameters after the URL fragment — cache-key / proxy interpretation differentials (CWE-444) |

Client audit is clean (0 vulnerabilities). `npm audit` reports `fixAvailable: true`.

## Current

`hono@4.13.3` (server, transitive via `@modelcontextprotocol/sdk@1.30.0`); override range `">=4.12.25"`

## Target

`hono@>=4.13.5` resolved in the server tree

## Proposed Fix

1. Bump the existing override in `server/package.json` from `">=4.12.25"` to `">=4.13.5"` (keeps the pin style already in use for `form-data`)
2. `cd server && npm install`
3. Confirm with `npm ls hono` (should report `4.13.5` or newer) and `npm audit` (0 vulnerabilities)
4. Confirm whether `@hono/node-server@2.0.12` needs a companion bump once hono 4.13.5+ is resolved

## Acceptance Criteria

- [ ] `server/package.json` override reads `">=4.13.5"`
- [ ] `npm ls hono` in `server/` reports `>=4.13.5`
- [ ] `npm audit` in `server/` reports 0 vulnerabilities
- [ ] Server tests pass (`cd server && npm test`)
- [ ] MCP server smoke-tested (Streamable HTTP) since hono sits in the MCP SDK tree

## Notes

- Prior hono fixes: `todos/complete/086-pending-p2-fix-server-cves.md`, `092-pending-p2-fix-server-cves.md`. The 2026-09 advisories extend the vulnerable range again (`<=4.13.4`), so the override needs a second nudge — this is the same parent chain recurring, not a new package.
- Not auto-applied: CVEs are never auto-applied by the weekly dependency check (even when the fix is a pin bump inside an existing override).
