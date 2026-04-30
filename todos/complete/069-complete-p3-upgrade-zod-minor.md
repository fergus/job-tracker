---
status: complete
priority: p3
issue_id: "069"
tags: [dependencies]
dependencies: []
---

# Upgrade zod from 4.3.6 to 4.4.1

## Problem Statement
zod 4.4.1 is available with minor improvements and fixes over the current 4.3.6. Staying current reduces future upgrade debt.

## Findings
- Current version: 4.3.6
- Latest version: 4.4.1
- Upgrade type: minor
- Location: server/

## Proposed Solutions
### Option A: Upgrade now
Run `npm install zod@4.4.1` in `server/`, verify build passes, then release.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [x] zod upgraded to v4.4.1 in server/package.json and server/package-lock.json
- [x] Build passes with no regressions
