---
status: complete
priority: p1
issue_id: "023"
tags: [code-review, security]
dependencies: []
---

# Attachment filename path traversal in sync engine

## Problem Statement
The sync engine uses `att.original_filename` directly to construct file paths without sanitization. A malicious filename like `../../etc/shadow` stored in the database would cause the sync engine to write to arbitrary locations.

## Findings
- `server/lib/sync-engine.mjs:305`: `path.join(filesDir, att.original_filename)` — no sanitization
- `server/lib/sync-engine.mjs:721,731`: Same issue in handleAttachmentAdd/Delete
- Flagged by: security-sentinel (H1)

## Proposed Solutions
### Option A: Use path.basename() to strip directory components
```js
const safeName = path.basename(att.original_filename);
const filePath = path.join(filesDir, safeName);
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] Filenames with path separators or `..` are sanitized before use
- [x] Attachment sync still works with normal filenames
