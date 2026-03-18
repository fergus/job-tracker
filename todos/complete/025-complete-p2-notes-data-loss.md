---
status: complete
priority: p2
issue_id: "025"
tags: [code-review, data-integrity]
dependencies: []
---

# Notes sync loses data when multiple notes exist per stage

## Problem Statement
The notes.md sync groups existing notes by stage and takes only the first note per stage. If a user has multiple "Interview" notes, the second is silently orphaned and cannot be edited via the filesystem.

## Findings
- `server/lib/sync-engine.mjs:658-659`: `if (!noteByStage[note.stage]) noteByStage[note.stage] = note` — skips subsequent notes
- Flagged by: kieran-typescript-reviewer (#6), architecture-strategist

## Proposed Solutions
### Option A: Make notes.md read-only (API->file only)
Remove file->API sync for notes. ~73 LOC removed, eliminates conflict class.
- **Effort**: Small | **Risk**: Low

### Option B: Concatenate multiple notes per stage
Join all notes for a stage with a delimiter (e.g., `---`) in the section.
- **Effort**: Medium | **Risk**: Medium

## Acceptance Criteria
- [x] Multiple notes per stage are not silently lost
- [x] Solution documented in _README.md
