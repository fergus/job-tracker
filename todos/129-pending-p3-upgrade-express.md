# Upgrade express 5.2.1 → 5.3.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-10-09
- **Category:** npm dependency (server)

## Problem

`express` is at `5.2.1` in `server/`. Latest is `5.3.0` (minor bump, same
major). Not auto-applied — the weekly check only auto-applies patch-level
bumps.

## Current

- Current version: `5.2.1`
- Latest version: `5.3.0`

## Proposed Fix

```bash
cd server && npm install express@5.3.0
```

Nice side effect: `express@5.3.0` declares `proxy-addr: ^2.0.8`, which clears
the **critical** `proxy-addr` advisory (see
`128-pending-p2-server-cve-proxy-addr.md`). Doing this bump and that CVE fix
together is one change, not two.

Skim the `5.2 → 5.3` changelog (`https://github.com/expressjs/express/releases`)
before upgrading — watch for middleware or router behaviour changes.

## Acceptance Criteria

- [ ] `server/package.json` references `^5.3.0`
- [ ] `cd server && npm test` passes (486 tests)
- [ ] `cd server && npm audit` no longer lists `proxy-addr`
- [ ] Manual smoke test: `/api/applications` list + one PATCH `/status` round-trip

## Notes

- `trust proxy` is enabled in `server/app.js`; re-verify the rate limiter still
  keys off the real client IP after the bump (send a spoofed `X-Forwarded-For`
  and confirm the limit still applies).
