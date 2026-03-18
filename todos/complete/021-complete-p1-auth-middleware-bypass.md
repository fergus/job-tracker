---
status: complete
priority: p1
issue_id: "021"
tags: [code-review, security]
dependencies: []
---

# Auth middleware weakened — header spoofing bypass in production

## Problem Statement
The auth middleware changes introduce a branch where sending both `X-Forwarded-Email` and `X-Forwarded-User` headers bypasses authentication in production, since the `else` branch accepts the email unconditionally. Also, the internal auth token allows impersonating ANY user, not just the configured SMB_USER_EMAIL.

## Findings
- `server/middleware/auth.js:28-31`: X-Forwarded-User presence skips the 401 check
- `server/middleware/auth.js:25-27`: Internal token accepts any email, should be pinned to SMB_USER_EMAIL
- Flagged by: security-sentinel (C1, C2), code-simplicity-reviewer, architecture-strategist

## Proposed Solutions
### Option A: Simplify to 3 branches
1. Valid internal token + email matches SMB_USER_EMAIL -> trust
2. No email + production -> 401
3. Otherwise -> use email (dev mode fallback)
Remove the X-Forwarded-User sniffing entirely.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] Internal token only works with configured SMB_USER_EMAIL
- [x] X-Forwarded-User header cannot bypass auth in production
- [x] Dev mode fallback still works without headers
