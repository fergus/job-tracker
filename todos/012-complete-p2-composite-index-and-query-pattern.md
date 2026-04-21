---
status: complete
priority: p2
issue_id: "012"
tags: [code-review, performance, pattern-recognition]
dependencies: []
---

# Composite Index Needed and updated_since Bypasses Query Pattern

## Problem Statement
The plan adds a single-column index on updated_at, but the query is `WHERE user_email = ? AND updated_at > ?` which needs a composite index. The code sample also uses a separate if/else branch that bypasses the existing conditions array pattern.

## Findings
- **Performance Oracle #8:** Single-column index on updated_at forces SQLite to scan index then filter by user_email. Need composite `(user_email, updated_at)`.
- **Pattern Recognition #4:** The updated_since code sample uses a separate query branch instead of appending to the existing conditions/params array, bypassing showAll/admin logic and status filter.

## Proposed Solutions

### Solution 1: Composite index + append to conditions array (Recommended)
```sql
CREATE INDEX IF NOT EXISTS idx_applications_user_email_updated_at ON applications(user_email, updated_at)
```
Add `updated_at > ?` as another condition in the existing conditions array.
- **Effort:** Small
- **Risk:** Low

## Acceptance Criteria
- [ ] Composite index on (user_email, updated_at)
- [ ] updated_since appends to existing conditions array
- [ ] Existing showAll/admin/status logic preserved

## Work Log
- 2026-03-09: Created from technical review (performance oracle, pattern recognition)
- 2026-04-21: Fixed. Added composite index; query pattern was already correct in service layer.
