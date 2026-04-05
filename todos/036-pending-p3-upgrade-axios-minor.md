---
status: complete
priority: p3
issue_id: "036"
tags: [dependencies]
dependencies: []
---

# Upgrade axios minor version (client)

## Problem Statement
`axios` in `client/` is locked at 1.13.6 but 1.14.0 is available. Minor releases
may include bug fixes, new features, or security-adjacent improvements.

## Findings
- Current version: 1.13.6 (locked in client/package-lock.json)
- Latest version: 1.14.0
- Upgrade type: minor

## Proposed Solutions
### Option A: Upgrade now
```bash
cd client && npm install axios@1.14.0
```
Verify the client build passes and HTTP calls behave correctly.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] `axios` upgraded to 1.14.0 in client/package-lock.json
- [ ] Client build passes with no regressions
