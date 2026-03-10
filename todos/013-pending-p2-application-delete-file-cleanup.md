---
status: pending
priority: p2
issue_id: "013"
tags: [code-review, data-integrity]
dependencies: []
---

# Application Deletion Doesn't Clean Up Attachment Files from Disk

## Problem Statement
The current DELETE /:id endpoint deletes CV and cover letter files, then deletes the database row. ON DELETE CASCADE removes attachment rows, but the physical attachment files remain on disk as orphans.

## Findings
- **Data Integrity Guardian 3b:** After Phase 1 adds more files per application, orphaned files accumulate faster.
- **Data Integrity Guardian 3c:** The delete order is wrong — files are deleted before the database row. If the process crashes between, the database references non-existent files. Should delete DB row first, then files.

## Proposed Solutions

### Solution 1: Read attachment paths, delete DB row, then delete files (Recommended)
1. Query all attachment stored_filenames for the application
2. Delete the database row (CASCADE handles attachment rows)
3. Delete physical files from disk
- **Effort:** Small
- **Risk:** Low — orphaned files are harmless, missing DB references cause errors

## Acceptance Criteria
- [ ] DELETE endpoint removes all attachment files from disk
- [ ] Database row deleted before files (safer crash ordering)
- [ ] No orphaned files after application deletion

## Work Log
- 2026-03-09: Created from technical review (data integrity guardian)
