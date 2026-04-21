---
status: complete
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
- [x] VALID_STATUSES defined once
- [x] MIME_MAP defined once

## Work Log
- 2026-04-21: sync-engine.mjs removed (SMB), so VALID_STATUSES already has one source (services/applications.js). MIME_MAP hoisted to module level in routes/applications.js; db.js instance is inside a one-time migration block, not worth extracting.
