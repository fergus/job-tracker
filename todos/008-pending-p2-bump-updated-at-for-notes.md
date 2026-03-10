---
status: pending
priority: p2
issue_id: "008"
tags: [code-review, data-integrity, architecture]
dependencies: []
---

# Bump Parent Application `updated_at` When Notes/Attachments Change

## Problem Statement
The incremental polling design uses `?updated_since=` to fetch only changed applications. But updating a note does NOT update the parent application's `updated_at`. Note changes made via the web UI will be invisible to the sync engine's incremental poll.

## Findings
- **Architecture Strategist #5:** The note PUT endpoint (line 443 in applications.js) does not touch parent updated_at. Incremental polling will silently miss note changes.
- **Data Integrity Guardian 8b:** Same finding for attachments — attachment CRUD doesn't bump parent updated_at.

## Proposed Solutions

### Solution 1: Update parent updated_at on note/attachment CRUD (Recommended)
Add `UPDATE applications SET updated_at = datetime('now') WHERE id = ?` after every note and attachment write operation.
- **Effort:** Small
- **Risk:** Low

## Technical Details
- **Affected files:** server/routes/applications.js (note POST, PUT, DELETE endpoints; attachment POST, DELETE endpoints)

## Acceptance Criteria
- [ ] Note create/update/delete bumps parent application updated_at
- [ ] Attachment create/delete bumps parent application updated_at
- [ ] Incremental polling catches note and attachment changes

## Work Log
- 2026-03-09: Created from technical review (architecture strategist, data integrity guardian)
