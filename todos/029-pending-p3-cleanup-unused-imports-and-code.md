---
status: pending
priority: p3
issue_id: "029"
tags: [code-review, quality]
dependencies: []
---

# Remove unused imports and simplify FormData chain

## Problem Statement
Minor code quality issues: unused `fsp` import, convoluted dynamic import chain for FormData/File that is unnecessary on Node 20.

## Findings
- `server/lib/sync-engine.mjs:2`: `import fsp from 'node:fs/promises'` — never used
- `server/lib/sync-engine.mjs:109-112`: Dynamic import chain for FormData — Node 20 has it natively
- Flagged by: kieran-typescript-reviewer (#13), code-simplicity-reviewer (#6)

## Proposed Solutions
### Option A: Remove unused import, use globalThis.FormData
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] No unused imports
- [ ] FormData/File use globalThis directly
