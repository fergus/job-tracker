# Fix server CVEs (ip-address high, hono moderate)

- **Priority:** p2
- **Created:** 2026-08-14
- **Category:** Security

## Problem

`npm audit` on `server/` reports 2 vulnerabilities:

| Package | Severity | Type | Fix |
|---------|----------|------|-----|
| `ip-address` | **HIGH** | Transitive (via express-rate-limit) | 10.5.0 (`npm audit fix`, within range) |
| `hono` | moderate | Transitive (via @modelcontextprotocol/sdk → @hono/node-server) | 4.13.2 (`npm audit fix`, within range) |

## Current

- `ip-address@10.2.0` — 3 advisories: leading-zero octet SSRF/trust-boundary bypass (GHSA-mwp4-54f8-5fhr, high), CIDR suffix suppresses special-use classification (GHSA-4xrf-jv44-h6hh, moderate), IPv4-mapped/NAT64 misclassification (GHSA-22jq-vg5j-6vgg, moderate)
- `hono@4.12.33` — 4 advisories: CORS middleware ReDoS (GHSA-8j4g-w8fx-2239), `memo()` SSR cross-user data disclosure (GHSA-f23p-vx2j-j53r), proxy Connection-header leak (GHSA-79qm-7rj5-m7r9), language middleware DoS (GHSA-54fx-42gc-7vw4)

## Target

All CVEs resolved

## Proposed Fix

```bash
cd server && npm audit fix
```

Dry run shows both fixes are in-range transitive bumps:
- `ip-address 10.2.0 → 10.5.0`
- `hono 4.12.33 → 4.13.2`

Both were NOT auto-applied because they are CVE fixes (p2 review items), even though they are in-range. Re-check whether express-rate-limit's next patch ships a fixed `ip-address` range to avoid a manual override.

## Notes

- Created 2026-08-14 during weekly dep check; express-rate-limit 8.6.1 → 8.6.2 patch did NOT resolve the ip-address advisory (still 10.2.0)
- Verify MCP server still functions after the hono bump (Streamable HTTP transport)

## Acceptance Criteria

- [x] `cd server && npm audit` reports 0 vulnerabilities
- [x] Server tests pass (`cd server && npm test`)
- [x] MCP server still functions correctly

## Completion
- Completed 2026-08-21: `npm audit fix` in server/ resolved all CVEs — ip-address 10.2.0 → 10.5.0 (via express-rate-limit 8.6.2), hono 4.12.33 → 4.13.3 (via @modelcontextprotocol/sdk 1.30.0 → @hono/node-server 2.0.12). `npm audit` reports 0 vulnerabilities. Server tests: 345/345 pass (suite covers the MCP Streamable HTTP transport). better-sqlite3 rebuilt after install-script skip.
