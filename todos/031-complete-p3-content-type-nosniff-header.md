---
status: complete
priority: p3
issue_id: "031"
tags: [code-review, security]
dependencies: []
---

# Add X-Content-Type-Options: nosniff to download responses

## Problem Statement
File download endpoints don't set X-Content-Type-Options header. Browsers could sniff content type and render HTML files disguised as PDFs, enabling stored XSS.

## Findings
- `server/routes/applications.js`: res.download() endpoints lack nosniff header
- Flagged by: security-sentinel (H3)

## Proposed Solutions
### Option A: Add header to download responses
```js
res.set('X-Content-Type-Options', 'nosniff');
res.download(filePath, filename);
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] All download endpoints include X-Content-Type-Options: nosniff

## Work Log
- 2026-04-21: Closed as already covered — helmet middleware (`app.use(helmet(...))` in server/app.js) sets X-Content-Type-Options: nosniff on every response including download endpoints. No explicit header needed.
