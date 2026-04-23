---
status: complete
priority: p1
issue_id: "051"
tags: [security, mcp, api, hardening]
dependencies: []
---

# MCP Server Security Hardening

## Summary

The MCP server (`server/mcp.js`) runs on a separate port (default 3001) and is exposed
in production via `docker-compose.yml` (`MCP_LISTEN_PORT`). It currently lacks basic
security controls that the main Express app has: rate limiting, request body size
caps, security headers, and CORS policy. This creates a distinct attack surface.

## Issues Found

### 1. No rate limiting
**File:** `server/mcp.js:188-205`

The MCP Express app has no rate limiting. An attacker can brute-force API keys or
flood the `/` endpoint with Initialize requests, exhausting memory (each POST
creates a new `McpServer` + `StreamableHTTPServerTransport` + session entry).

**Current code:**
```js
const app = express();
app.use(express.json());
```

**Fix:** Add `express-rate-limit` identical to the main app's pattern:
```js
const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MCP ?? '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(mcpLimiter);
```

### 2. No request body size limit
**File:** `server/mcp.js:190`

`express.json()` defaults to accepting bodies up to ~100KB with no explicit cap.
The main app uses `express.json({ limit: '100kb' })`.

**Fix:**
```js
app.use(express.json({ limit: '100kb' }));
```

### 3. No Helmet security headers
**File:** `server/mcp.js:188-239`

The MCP app has no CSP, HSTS, X-Frame-Options, or other security headers. Since
it handles authentication tokens, this is a hardening gap.

**Fix:** Add `helmet()` with a minimal CSP (MCP is JSON-only, no HTML rendering):
```js
app.use(helmet({
  contentSecurityPolicy: false, // MCP returns JSON, not HTML
  crossOriginEmbedderPolicy: false,
}));
```

### 4. Per-request `McpServer` instantiation
**File:** `server/mcp.js:225`

Every POST without a session ID creates a brand-new `McpServer` instance. The
tools, schemas, and Zod validators are rebuilt from scratch. This is wasteful and
increases latency under load.

**Fix:** Create one `McpServer` instance at module level and reuse it:
```js
const mcpServer = createMcpServer(); // moved outside startMcpServer

// inside route handler:
await mcpServer.connect(transport);
```

### 5. No CORS configuration
**File:** `server/mcp.js:188-239`

If the MCP port is ever exposed directly (bypassing oauth2-proxy), cross-origin
requests from arbitrary origins are accepted.

**Fix:** Add explicit CORS denial in production, or restrict to known origins.

## Recommended Actions

- [x] Add `express-rate-limit` to MCP server with configurable `RATE_LIMIT_MCP`
- [x] Add `express.json({ limit: '100kb' })` to MCP server
- [x] Add `helmet()` with JSON-appropriate settings to MCP server
- [x] Move `createMcpServer()` call to module level and reuse per session
- [x] CORS: intentionally omitted — MCP is not browser-facing; no CORS headers are sent
- [x] Add test coverage for MCP rate limiting and oversized bodies

## Acceptance Criteria

- [x] MCP server rejects >100KB JSON bodies with 413
- [x] MCP server rate-limits requests (tested in `api.test.js`)
- [x] MCP responses include `X-Content-Type-Options: nosniff` and other Helmet headers
- [x] `McpServer` is instantiated once, not per POST
- [x] Server tests pass (56/56); Docker build succeeds

## Work Log

- 2026-04-23: Created from code-review security audit of `server/mcp.js`
- 2026-04-23: Implemented hardening — added helmet, rate-limit, 100kb body cap, trust proxy,
  and moved `McpServer` to module-level singleton. Added 5 MCP-specific tests to
  `server/test/api.test.js`. All 56 tests pass.
