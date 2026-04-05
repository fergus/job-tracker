---
status: complete
priority: p2
issue_id: "034"
tags: [security, owasp, rate-limiting]
dependencies: []
---

# Apply express-rate-limit to All API Routes

## Problem Statement
`express-rate-limit` v8.2.1 is listed as a dependency in `server/package.json` but is never imported or applied in `server/app.js`. There is no rate limiting on any endpoint.

## Findings
- **OWASP A04 — Insecure Design:** Authenticated users can spam file upload endpoints (`POST /:id/attachments`) to exhaust disk space with no throttling.
- **OWASP A04 — Insecure Design:** Application IDs are sequential SQLite autoincrement integers. Without rate limiting, an authenticated user can enumerate all application IDs by iterating integers and observing 404 vs 200 responses.
- `app.set('trust proxy')` is absent — without it, `req.ip` resolves to oauth2-proxy's container IP instead of the real client IP, making any rate limiting trivially bypassable.

## Proposed Solution
In `server/app.js`:
1. Add `app.set('trust proxy', 1)` so Express uses `X-Forwarded-For` for `req.ip`.
2. Import `express-rate-limit` and apply a general limiter to all `/api` routes (e.g. 100 req/min per IP).
3. Apply a tighter limiter to upload endpoints (e.g. 20 req/min per IP): `POST /:id/attachments`, `POST /:id/cv`, `POST /:id/cover-letter`.

## Acceptance Criteria
- [x] `app.set('trust proxy', 1)` added
- [x] General rate limiter applied to all `/api/*` routes
- [x] Tighter rate limiter applied to file upload endpoints
- [x] Rate limit headers returned to clients (default behavior of express-rate-limit)

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
- 2026-04-06: Implemented — added trust proxy, apiLimiter (100/min), uploadLimiter (20/min) in server/app.js
