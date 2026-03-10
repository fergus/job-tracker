---
status: pending
priority: p3
issue_id: "032"
tags: [code-review, performance]
dependencies: []
---

# Cache auth upsert to reduce SQLite write contention

## Problem Statement
Auth middleware runs INSERT ... ON CONFLICT UPDATE on every API request. During fullSync with 500 apps, that is 501 writes in rapid succession, competing with other SQLite writes.

## Findings
- `server/middleware/auth.js:36`: upsertUser.run() on every request
- Flagged by: performance-oracle (#6)

## Proposed Solutions
### Option A: In-memory Set with TTL
Cache known emails in a Set, only upsert once per minute per user.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] Repeated requests from same user don't trigger DB write
- [ ] New users are still upserted on first request
