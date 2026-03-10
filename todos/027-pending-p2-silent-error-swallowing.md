---
status: pending
priority: p2
issue_id: "027"
tags: [code-review, quality]
dependencies: []
---

# Silent error swallowing in sync engine

## Problem Statement
Multiple empty `catch {}` blocks silently discard errors, making production debugging extremely difficult. Corrupted files or permission issues will go undetected.

## Findings
- `server/lib/sync-engine.mjs:376`: Empty catch in removeStaleDirectories
- `server/lib/sync-engine.mjs:352`: Empty catch in writeFromApi
- Flagged by: kieran-typescript-reviewer (#2)

## Proposed Solutions
### Option A: Log warnings in catch blocks
Replace `catch {}` with `catch (e) { console.warn('[sync] ...', e.message); }`
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] No empty catch blocks remain
- [ ] Errors are logged at warn level with context
