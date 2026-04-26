---
title: File Cleanup Ordering — Orphaned Uploads on Partial Failure
date: 2026-04-23
category: logic-errors
module: Application file upload lifecycle
problem_type: logic_error
component: service_object
severity: high
symptoms:
  - "Orphaned files accumulating in uploads directory with no database reference"
  - "404 errors when accessing CV or cover letter attachments after replacement"
  - "Database rows referencing files that no longer exist on disk"
root_cause: logic_error
resolution_type: code_fix
related_components:
  - database
tags:
  - file-cleanup
  - orphaned-files
  - uploads
  - consistency
  - deletion
  - better-sqlite3
---

# File Cleanup Ordering — Orphaned Uploads on Partial Failure

## Problem

Three file-management code paths had incorrect ordering between database mutations and filesystem deletions. In deletion flows the DB row was removed first and files second, so a crash between the two left orphaned files on disk. In replacement flows the old file was deleted first and the DB updated second, so a DB failure left a broken reference that returned 404s.

This is a classic two-phase commit problem: the database and the filesystem cannot be updated atomically, so the order of operations determines which failure mode is possible.

## Symptoms

- Files accumulate in `uploads/` that are no longer referenced by any database record (orphaned uploads)
- Downloading a CV or cover letter after uploading a replacement returns 404 because the old file was deleted before the database was updated, and a subsequent DB failure left a stale reference
- Over time the `uploads/` directory grows with unreachable files, wasting disk space

## What Didn't Work

- **Deleting files before updating the database:** in CV/cover-letter replacement, if the DB update failed (validation error, constraint violation, disk full), the record still pointed to the now-deleted old file, causing permanent 404s
- **Deleting database rows before files without a resilient deletion helper:** any filesystem error (permissions, race condition, path traversal) would throw an unhandled exception and potentially crash the Node process
- **Relying solely on correct ordering without a startup sweeper:** past crashes, interrupted requests, or deployment artifacts could still leave orphaned files on disk indefinitely
- **An earlier partial fix (commit `5481f6b`, March 2026):** only removed multer-written temp files when an attachment upload failed an ownership check. It did not address the systemic ordering problem across `deleteApplication`, attachment deletion, and CV/cover-letter replacement

## Solution

### 1. `safeDeleteFile` helper

Added in `server/services/applications.js` — async deletion that swallows errors and logs them:

```js
async function safeDeleteFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      await fsPromises.unlink(filePath);
    }
  } catch (err) {
    console.error('[cleanup] Failed to delete file:', filePath, err.message);
  }
}
```

### 2. `deleteApplication` — DB first, files second

In `server/services/applications.js`:

```js
db.prepare('DELETE FROM applications WHERE id = ? AND user_email = ?').run(id, userEmail);

for (const filename of filesToDelete) {
  const filePath = safePath(uploadsDir, filename);
  if (filePath) safeDeleteFile(filePath);
}
```

### 3. Attachment deletion route — DB first, file second

In `server/routes/applications.js`:

```js
const now = new Date().toISOString();
db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.attachmentId);
db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id);

const filePath = safePath(uploadsDir, attachment.stored_filename);
if (filePath) safeDeleteFile(filePath);
```

### 4. CV/cover-letter replacement — DB first, old file second

In `server/routes/applications.js` (same pattern for both `/cv` and `/cover-letter`):

```js
const oldPath = existing.cv_path ? safePath(uploadsDir, existing.cv_path) : null;

db.prepare('UPDATE applications SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ? AND user_email = ?')
  .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id, req.userEmail);

if (oldPath) safeDeleteFile(oldPath);
```

### 5. Startup orphaned-file sweeper

In `server/db.js`, scans `uploads/` on boot and removes any file not referenced by `applications.cv_path`, `applications.cover_letter_path`, or `attachments.stored_filename`. Skipped when `DB_PATH === ':memory:'`.

### 6. Integration tests

Added in `server/test/api.test.js`:
- `DELETE /api/applications/:id removes CV file from disk`
- `DELETE /api/applications/:id removes attachment files from disk`
- `POST /api/applications/:id/cv replaces old CV file on disk`
- `DELETE /api/applications/:id/attachments/:attachmentId removes file from disk`

## Why This Works

Database transactions are the source of truth; filesystem operations are side effects. By committing the database mutation first, we guarantee the canonical state is always consistent. If a file deletion fails or is interrupted, the worst outcome is an orphaned file on disk — the database never references a non-existent file.

The `safeDeleteFile` wrapper ensures filesystem failures are logged rather than thrown, preventing unhandled exceptions from propagating to HTTP responses. The startup sweeper provides a backstop that repairs any orphans from past crashes or edge cases.

## Prevention

- **Always mutate the database before performing filesystem side effects** in the same request. A missing file is recoverable (return 404); a missing DB row is data loss.
- **Wrap all non-critical cleanup operations in try/catch helpers that log instead of throw.** Never let a file-deletion failure crash an otherwise-successful HTTP response.
- **Add startup sweepers or periodic background jobs** to reconcile filesystem state with database state, especially after deployments or crash recoveries.
- **Write integration tests that assert on actual disk state**, not just HTTP response codes. `fs.existsSync()` after deletion is a cheap regression guard.
- **Keep file-upload routes simple:** save the new file, update the DB, then lazily delete the old file. Never delete the old file before the DB commit.

## Related

- [SMB Filesystem Sync Implementation Lessons](../../integration-issues/smb-filesystem-sync-implementation.md) — Section 3 covers an earlier observation of the orphaned-uploads anti-pattern with multer
- `todos/complete/013-complete-p2-application-delete-file-cleanup.md` — an earlier fix for application deletion only, superseded by this more robust solution
- [#055 Graceful Shutdown](../../workflow-issues/graceful-shutdown-2026-04-23.md) — same commit; closing servers cleanly prevents in-flight requests from being interrupted mid-cleanup
