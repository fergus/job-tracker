---
status: complete
priority: p2
issue_id: "026"
tags: [code-review, data-integrity, performance]
dependencies: []
---

# Attachment sync race condition and unbounded memory

## Problem Statement
1. syncAttachmentFiles fires downloadAttachment async with .catch() (fire-and-forget), then immediately deletes unexpected files. A file being downloaded could be deleted mid-write.
2. All attachment downloads run concurrently with no limit — 200 files at 10MB = 2GB memory.
3. Downloads buffer entire file in memory via res.arrayBuffer().

## Findings
- `server/lib/sync-engine.mjs:310-312`: Fire-and-forget download with .catch()
- `server/lib/sync-engine.mjs:328-340`: Full file buffered in memory
- Flagged by: performance-oracle (#2), kieran-typescript-reviewer (#3)

## Proposed Solutions
### Option A: Await downloads with concurrency limit, stream to disk
Use p-limit (concurrency: 3-5), stream downloads with res.body.pipe(createWriteStream). Don't delete files not in API response (let web UI be authority for deletes).
- **Effort**: Medium | **Risk**: Low

## Acceptance Criteria
- [x] Downloads are awaited, not fire-and-forget
- [x] Concurrency limited to prevent OOM
- [x] No race between download and delete
- [x] Update documentation
