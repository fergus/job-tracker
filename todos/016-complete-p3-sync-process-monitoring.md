---
status: complete
priority: p3
issue_id: "016"
tags: [code-review, architecture, reliability]
dependencies: []
---

# No Crash Recovery for Sync Process

## Problem Statement
If the sync engine crashes, nothing restarts it. Express continues running, Docker doesn't restart the container, but the SMB share becomes stale.

## Findings
- **Architecture Strategist #6:** The entrypoint backgrounds the sync process with `&` and nothing monitors it.

## Proposed Solutions
### Solution 1: Express health check (Recommended for simplicity)
Have Express periodically check if the sync process is alive (check PID file or process existence). Log a warning if it's gone and display a warning in the ui.
- **Effort:** Small
- **Risk:** Low

### Solution 2: Lightweight process supervisor (s6-overlay)
- **Effort:** Medium
- **Risk:** Low but adds dependency

## Acceptance Criteria
- [ ] Sync process crash is detected and logged
- [ ] Ideally: sync process auto-restarts on crash
- [ ] Disply process crash warning in the ui

## Work Log
- 2026-03-09: Created from technical review (architecture strategist)
- 2026-04-21: Closed as obsolete — SMB sync engine removed in v0.9.0
