---
status: complete
priority: p1
issue_id: "020"
tags: [code-review, security, performance]
dependencies: []
---

# Binary file hash corruption causes infinite re-sync loops

## Problem Statement
The sync engine hashes binary files (PDFs, DOCXs) by converting Buffer to UTF-8 string before hashing. Invalid UTF-8 bytes get replaced with the Unicode replacement character, producing different hashes on each read. This causes every poll cycle to re-download every attachment and potentially re-upload them.

## Findings
- `server/lib/sync-engine.mjs:339`: `sha256(buf.toString('utf-8'))` corrupts binary content
- `server/lib/sync-engine.mjs:724`: `fs.readFileSync(filePath, 'utf-8').toString()` same issue in handleAttachmentAdd
- Flagged by: performance-oracle, kieran-typescript-reviewer, architecture-strategist (unanimous)

## Proposed Solutions
### Option A: Hash raw Buffer directly
- Change `sha256()` to accept Buffer, remove UTF-8 encoding
- `this.lastWrittenHashes.set(destPath, sha256(buf))` instead of `sha256(buf.toString('utf-8'))`
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] Binary attachments (PDF, DOCX) are not re-downloaded on every poll cycle
- [x] Hash comparison works correctly for both text and binary files
