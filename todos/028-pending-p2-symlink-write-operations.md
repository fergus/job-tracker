---
status: pending
priority: p2
issue_id: "028"
tags: [code-review, security]
dependencies: []
---

# Write operations follow symlinks despite O_NOFOLLOW on reads

## Problem Statement
readFileNoFollow correctly uses O_NOFOLLOW for reads, but writeFromApi and downloadAttachment use fs.writeFileSync which follows symlinks. TOCTOU race: attacker replaces file with symlink between check and write.

## Findings
- `server/lib/sync-engine.mjs:354`: writeFromApi uses fs.writeFileSync (follows symlinks)
- `server/lib/sync-engine.mjs:338`: downloadAttachment same issue
- Flagged by: security-sentinel (H2)

## Proposed Solutions
### Option A: Open with O_WRONLY | O_CREAT | O_NOFOLLOW and write to fd
```js
const fd = fs.openSync(filePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW);
fs.writeSync(fd, content);
fs.closeSync(fd);
```
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] All file writes in sync engine use O_NOFOLLOW
- [ ] Symlink replacement between check and write is prevented
