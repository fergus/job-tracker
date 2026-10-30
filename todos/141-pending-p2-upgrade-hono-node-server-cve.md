# Upgrade `@hono/node-server` to clear the `serveStatic` path-decode advisory (server)

- **Priority:** p2
- **Created:** 2026-10-31
- **Category:** Security (npm, server)

## Problem

`npm audit` on `server/` reports one moderate finding:

**GHSA-rmxm-3fg6-px4f** — `@hono/node-server` `serveStatic` decodes the request
path a second time, leading to bypass of middleware on static paths. CVSS 5.3
(`AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N`), CWE-174, affected range
`>=1.19.10 <2.1.3`.

The vulnerable copy is transitive:

```
@modelcontextprotocol/sdk@1.32.2
└── @hono/node-server@2.0.12   # vulnerable
```

This is a **different advisory** from the hono one closed on 2026-10-25 in
`todos/complete/138-complete-p2-cve-hono-servestatic-static-bypass.md`: that one
lived in `hono` itself and was fixed at 4.13.11+; this one lives in
`@hono/node-server` and is fixed at 2.1.3+.

**Exposure note:** the app does not serve static files through hono. Express
serves the SPA, and `@hono/node-server` exists only as the MCP SDK's HTTP
transport dependency, which is mounted at `/` on the MCP port and authenticated
by Bearer API key. The advisory is about middleware bypass on static paths, so
realistic exposure to this instance is low — hence p2, not p1.

## Current

- `@hono/node-server`: 2.0.12 (transitive, via `@modelcontextprotocol/sdk@1.32.2`)
- Fixed in: 2.1.3+ (latest published is **2.1.5**)
- SDK's declared range is `^1.19.9 || ^2.0.5`, so 2.1.5 is already permitted
- `npm audit` reports `fix available via npm audit fix`

## Proposed Solutions

### Option A: `npm audit fix` (preferred)

The fix is inside the SDK's declared range, so this should be a lockfile-only
bump with no direct dependency moving.

```bash
cd server && npm audit fix
npm ls @hono/node-server      # expect 2.1.3+
npm audit                     # expect clean
npm rebuild better-sqlite3 && npm test
```

Confirm `git diff` touches only `server/package-lock.json`. If `audit fix` wants
to change a direct dependency, stop and use Option B.

### Option B: `overrides`

If the lockfile bump refuses to resolve, add to `server/package.json`:

```json
"overrides": { "@hono/node-server": "^2.1.5" }
```

then `npm install`, re-audit, and re-test.

- **Effort**: Small | **Risk**: Low (transitive lockfile bump; MCP transport is exercised by the existing test suite)

## Acceptance Criteria

- [ ] `cd server && npm ls @hono/node-server` resolves to 2.1.3 or later
- [ ] `cd server && npm audit` reports 0 vulnerabilities
- [ ] `cd server && npm test` passes (498 tests as of 2026-10-31)
- [ ] MCP server still starts and completes a session (e.g. a `list_applications` call over the MCP port)
