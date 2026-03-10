---
status: pending
priority: p3
issue_id: "015"
tags: [code-review, performance]
dependencies: []
---

# Performance Optimizations: Poll Interval, Hash Pruning, Async I/O

## Problem Statement
Several performance improvements identified that are not critical for v1 but would improve behavior at scale.

## Findings
- **Performance Oracle #6:** awaitWriteFinish pollInterval at 100ms is aggressive. 200 stat calls/second with 20 files. Increase to 300ms.
- **Performance Oracle #4:** lastWrittenHashes map grows without bound. Stale entries could suppress legitimate syncs.
- **Performance Oracle #5:** appIdByDir map has same staleness problem. Should periodically reconcile.
- **Performance Oracle #7:** waitForFile uses polling with 5-second timeout, blocking the event loop. Should use event-driven detection.
- **Performance Oracle #9:** fullSync writes files synchronously, blocking the event loop. Use fs.promises with controlled concurrency.
- **Performance Oracle #1:** fullSync is O(n) in file I/O. Differential sync using manifest hashes would reduce startup time.

## Proposed Solutions
### Solution 1: Incremental improvements
- Increase pollInterval to 300ms
- Prune lastWrittenHashes during each poll cycle
- Reconcile appIdByDir every 10th poll cycle
- Replace waitForFile polling with chokidar event registration
- Use async file I/O in fullSync with batch concurrency (10 at a time)
- **Effort:** Medium (combined)
- **Risk:** Low

## Acceptance Criteria
- [ ] awaitWriteFinish.pollInterval set to 300ms
- [ ] lastWrittenHashes pruned periodically
- [ ] appIdByDir reconciled periodically
- [ ] waitForFile is event-driven, not polling
- [ ] fullSync uses async I/O

## Work Log
- 2026-03-09: Created from technical review (performance oracle)
