---
status: complete
priority: p1
issue_id: "022"
tags: [code-review, security]
dependencies: ["021"]
---

# Use timing-safe comparison for internal auth token

## Problem Statement
The internal auth token comparison uses JavaScript `===` which is vulnerable to timing attacks. An attacker who can make requests to Express directly could extract the token byte-by-byte through timing analysis.

## Findings
- `server/middleware/auth.js:25`: `internalToken === internalAuthToken`
- Flagged by: security-sentinel (C3), code-simplicity-reviewer, architecture-strategist

## Proposed Solutions
### Option A: Use crypto.timingSafeEqual
```js
const crypto = require('crypto');
function safeCompare(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] Token comparison uses crypto.timingSafeEqual
- [x] Empty/null tokens do not crash
