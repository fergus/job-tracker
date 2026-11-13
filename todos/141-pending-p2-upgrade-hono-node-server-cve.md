# Upgrade `hono` + `@hono/node-server` to clear the MCP-transport advisories (server)

- **Priority:** p2
- **Created:** 2026-10-31
- **Updated:** 2026-11-13 (advisory set expanded — `hono` itself is now flagged too)
- **Category:** Security (npm, server)

## Problem

`npm audit` on `server/` reports **two moderate findings** in the MCP SDK's
transitive tree, carrying **eight advisories between them**:

### `@hono/node-server` — installed 2.0.12, affected `1.19.10 – 2.1.5`

| Advisory | Summary |
|----------|---------|
| GHSA-rmxm-3fg6-px4f | `serveStatic` decodes the request path a second time, bypassing middleware on static paths (CVSS 5.3, CWE-174) |
| — | Unhandled `ECONNRESET` on the socket during an asynchronous WebSocket upgrade crashes the process |
| — | Backslash in the request path parsed as a path separator, bypassing path-based access control at a reverse proxy |

### `hono` — installed 4.13.13, affected `<= 4.13.15`

| Advisory | Summary |
|----------|---------|
| — | `mount()` / `app.mount()` can forward a path that bypasses middleware scoped inside the mount prefix |
| — | RegExpRouter skips wildcard middleware for some route sets and for paths with an encoded line terminator |
| — | `css` helper does not escape a closing tag split between the template and an interpolated value (HTML injection) |
| — | `csrf()` does not check requests sent by hypermedia auditing (`text/ping`) |
| — | `validator('form')` skips validation for `multipart/form-data` requests with extra parameters |

Vulnerable copies:

```
@modelcontextprotocol/sdk@1.32.2
├── hono@4.13.13              # vulnerable
└── @hono/node-server@2.0.12  # vulnerable
```

The `@hono/node-server` `serveStatic` advisory is a **different** one from the
hono finding closed on 2026-10-25 in
`todos/complete/138-complete-p2-cve-hono-servestatic-static-bypass.md`: that one
lived in `hono` itself and was fixed at 4.13.11+; the 2026-11-13 pass shows
`hono` has since accumulated a fresh set of its own advisories, so both packages
must move together.

**Exposure note:** the app does not serve static files through hono. Express
serves the SPA, and these packages exist only as the MCP SDK's HTTP transport
dependency, mounted at `/` on the MCP port and authenticated by Bearer API key.
Several of the advisories (middleware-scoped-in-mount bypass, router wildcard
skips, `csrf()`) do not apply to a setup that registers no hono middleware and
issues no CSRF tokens. Realistic exposure is low — hence p2, not p1.

## Current

- `hono`: 4.13.13 (transitive, via `@modelcontextprotocol/sdk@1.32.2`)
  — fixed in **4.13.16+**, latest published **4.13.18**
- `@hono/node-server`: 2.0.12 (transitive, same parent)
  — fixed in **2.1.6+**, latest published **2.1.8**
- The SDK's declared ranges are `^4.11.4` and `^1.19.9 || ^2.0.5`, so both
  latest versions are already permitted — no direct dependency has to move
- `npm audit` reports `fixAvailable: true` for both

## Proposed Solutions

### Option A: `npm audit fix` (preferred)

The fix is inside the SDK's declared ranges, so this should be a lockfile-only
bump with no direct dependency moving.

```bash
cd server && npm audit fix
npm ls hono @hono/node-server   # expect 4.13.16+ / 2.1.6+
npm audit                       # expect 0 vulnerabilities
npm rebuild better-sqlite3 && npm test
```

Confirm `git diff` touches only `server/package-lock.json`. If `audit fix` wants
to change a direct dependency, stop and use Option B.

### Option B: `overrides`

If the lockfile bump refuses to resolve, add to `server/package.json`:

```json
"overrides": { "hono": "^4.13.18", "@hono/node-server": "^2.1.8" }
```

then `npm install`, re-audit, and re-test.

- **Effort**: Small | **Risk**: Low (transitive lockfile bump; MCP transport is exercised by the existing test suite)

## Acceptance Criteria

- [ ] `cd server && npm ls hono @hono/node-server` resolves to 4.13.16+ and 2.1.6+
- [ ] `cd server && npm audit` reports 0 vulnerabilities
- [ ] `cd server && npm test` passes (558 tests as of 2026-11-13)
- [ ] MCP server still starts and completes a session (e.g. a `list_applications` call over the MCP port)
- [ ] `npm run build:client` succeeds from the repo root
