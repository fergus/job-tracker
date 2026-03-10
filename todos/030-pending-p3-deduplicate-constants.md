---
status: pending
priority: p3
issue_id: "030"
tags: [code-review, quality]
dependencies: []
---

# Deduplicate VALID_STATUSES and MIME_MAP constants

## Problem Statement
VALID_STATUSES defined in applications.js and sync-engine.mjs. MIME_MAP defined in db.js and applications.js. Single source of truth would prevent drift.

## Findings
- Flagged by: code-simplicity-reviewer (#duplicated-patterns)

## Proposed Solutions
### Option A: Extract to shared constants file
Create `server/lib/constants.js` (CJS) and import in both places. Sync engine (.mjs) can use dynamic import or read from a JSON file.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] VALID_STATUSES defined once
- [ ] MIME_MAP defined once
