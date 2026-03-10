---
status: pending
priority: p2
issue_id: "024"
tags: [code-review, performance]
dependencies: []
---

# Replace full-sync polling with incremental updated_since filtering

## Problem Statement
pollForChanges() calls fullSync() every 30s, fetching ALL applications plus N attachment requests. At 500 apps this is 501 HTTP requests per cycle. Will break at ~200-500 applications.

## Findings
- `server/lib/sync-engine.mjs:216-223`: pollForChanges calls fullSync unconditionally
- Flagged by: performance-oracle (#1), architecture-strategist, code-simplicity-reviewer

## Proposed Solutions
### Option A: Add updated_since query parameter
Add `?updated_since=<ISO timestamp>` to GET /applications, track lastSyncTime in engine, only sync changed apps.
- **Effort**: Medium | **Risk**: Low

## Acceptance Criteria
- [ ] GET /applications supports updated_since parameter
- [ ] Polling only fetches applications changed since last sync
- [ ] Full sync still runs on startup
