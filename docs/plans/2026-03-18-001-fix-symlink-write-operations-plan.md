---
title: Fix write operations to use O_NOFOLLOW (symlink TOCTOU hardening)
type: fix
status: obsolete
date: 2026-03-18
closed: 2026-04-21
---

# Fix write operations to use O_NOFOLLOW (symlink TOCTOU hardening)

## Overview

The sync engine already uses `readFileNoFollow` (with `O_NOFOLLOW`) for all reads, but both write paths use `fs.writeFileSync` which follows symlinks. An attacker who can write to the sync directory could replace a file with a symlink between the check and the write, redirecting writes to an arbitrary path on the filesystem.

## Problem Statement

Two write sites in `server/lib/sync-engine.mjs` are vulnerable:

- **Line 343** (`downloadAttachment`): `fs.writeFileSync(destPath, buf)` — writes downloaded attachment binary
- **Line 359** (`writeFromApi`): `fs.writeFileSync(filePath, content)` — writes markdown/frontmatter files

`writeFromApi` is especially exposed: it calls `readFileNoFollow` (safe) then `writeFileSync` (unsafe) — the TOCTOU window sits between those two calls.

## Proposed Solution

Add a `writeFileNoFollow` helper adjacent to `readFileNoFollow` (lines 62–70), then replace both `writeFileSync` calls with it.

```js
// server/lib/sync-engine.mjs — add after readFileNoFollow
function writeFileNoFollow(filePath, data) {
  const fd = fs.openSync(
    filePath,
    fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_TRUNC | fs.constants.O_NOFOLLOW
  );
  try {
    fs.writeSync(fd, data);
  } finally {
    fs.closeSync(fd);
  }
}
```

`fs.writeSync(fd, data)` handles both `Buffer` (binary, `downloadAttachment`) and `string` (UTF-8, `writeFromApi`) without changes to callers.

`O_NOFOLLOW` returns `ELOOP` on Linux if the path is a symlink — regardless of `O_CREAT` — which is the desired behaviour.

## Technical Considerations

- **Binary vs string**: `fs.writeSync` accepts both `Buffer` and `string`; no caller changes needed.
- **`O_CREAT` + `O_NOFOLLOW`**: Creates file if absent; rejects symlinks if present. Safe for both new and existing paths.
- **Mirrors existing pattern**: mirrors `readFileNoFollow` exactly — open fd, try/finally close.
- **No other write sites**: a grep of `sync-engine.mjs` confirms exactly two `writeFileSync` calls; no other write paths exist.

## Affected Files

- `server/lib/sync-engine.mjs` — add `writeFileNoFollow` helper, replace two `writeFileSync` calls

## Acceptance Criteria

- [ ] `writeFileNoFollow` helper added adjacent to `readFileNoFollow` (after line 70)
- [ ] `downloadAttachment` (line 343) uses `writeFileNoFollow`
- [ ] `writeFromApi` (line 359) uses `writeFileNoFollow`
- [ ] No `writeFileSync` calls remain in `sync-engine.mjs`
- [ ] Todo `todos/028-pending-p2-symlink-write-operations.md` marked `complete`

## Sources

- Todo: [todos/028-pending-p2-symlink-write-operations.md](../../todos/028-pending-p2-symlink-write-operations.md)
- Existing read pattern to mirror: [server/lib/sync-engine.mjs:62-70](../../server/lib/sync-engine.mjs#L62-L70)
- Write sites: [server/lib/sync-engine.mjs:343](../../server/lib/sync-engine.mjs#L343), [server/lib/sync-engine.mjs:359](../../server/lib/sync-engine.mjs#L359)
