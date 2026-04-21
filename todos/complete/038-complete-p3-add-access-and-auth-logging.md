---
status: complete
priority: p3
issue_id: "038"
tags: [security, owasp, logging, monitoring]
dependencies: []
---

# Add HTTP Access Logging and Auth Event Logging

## Problem Statement
The API has no HTTP access logging. Auth failures, admin actions, and file downloads are completely invisible in logs. The sync engine logs extensively, but the HTTP layer is a blind spot.

## Findings
- **OWASP A09 — Security Logging and Monitoring Failures:** No way to detect brute-force attempts, unusual access patterns, or unauthorized access attempts after the fact.
- Auth failures (missing/invalid headers) produce no log output.
- Admin use of `GET /api/applications?all=true` is not logged.
- File downloads of other users' attachments (admin-only) are not logged.
- `console.error(err)` in the global error handler logs the full error object, which may include sensitive stack trace details in structured log pipelines.

## Proposed Solution

### 1. Add Morgan for HTTP access logging (`server/app.js`)
```js
import morgan from 'morgan';
app.use(morgan('combined'));  // or 'short' for less verbosity
```
Morgan is not currently installed — add it: `npm install morgan`.

### 2. Log auth events in `server/middleware/auth.js`
Add a log line on auth failure (missing headers in production, invalid internal token):
```js
console.warn(`[auth] rejected request: missing forwarded headers from ${req.ip}`);
```

### 3. Log admin actions in routes
In `server/routes/applications.js`, log when an admin accesses another user's data:
```js
if (req.isAdmin && showAll) {
  console.info(`[admin] ${req.userEmail} accessed all applications`);
}
```
Similarly for admin attachment downloads.

### 4. Sanitize error handler
Replace `console.error(err)` with structured logging that captures `err.message` and `err.stack` without forwarding the raw object.

## Acceptance Criteria
- [x] Morgan middleware added for HTTP access logs
- [x] Auth failures logged with IP and reason
- [x] Admin `?all=true` usage logged with admin email
- [x] Admin attachment downloads logged with admin email and attachment ID
- [x] Global error handler logs message + stack without leaking the raw error object

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
- 2026-04-21: Implemented — morgan('short') in app.js; auth failure warns in middleware/auth.js; admin list/download/attachment logs in routes/applications.js; error handler sanitised
