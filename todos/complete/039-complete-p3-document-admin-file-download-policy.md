---
status: complete
priority: p3
issue_id: "039"
tags: [security, owasp, documentation, admin]
dependencies: []
---

# Document Admin File Download Policy

## Problem Statement
Admins can download any user's attachments (CVs, cover letters) via `GET /api/applications/:id/attachments/:attachmentId`. This is intentional per the "admins can view all data" design, but it is not documented anywhere in the codebase. Downloaded files leave the server boundary and may contain sensitive personal information.

## Findings
- **OWASP A01 — Broken Access Control (informational):** The behavior is correct by design but undocumented, making it easy to miss in future audits or when onboarding new contributors.
- CLAUDE.md states admins "can view all users' applications but cannot edit/delete others' data" — file downloads are a read operation not explicitly covered by this statement.

## Proposed Solution

### 1. Add a comment in `server/routes/applications.js`
Near the admin branch of the attachment download handler (around line 436):
```js
// Admins can download attachments for any application (read-only access).
// Files leave the server boundary — ensure audit logging is in place (see todo 038).
```

### 2. Update CLAUDE.md
Extend the auth section to explicitly cover file downloads:
> Admin users can view and download attachments for any user's applications (read-only). They cannot create, update, or delete records belonging to other users.

## Acceptance Criteria
- [ ] Comment added in `routes/applications.js` near admin attachment download branch
- [ ] CLAUDE.md updated to explicitly mention admin file download access

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
