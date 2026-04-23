---
status: open
priority: p2
issue_id: "054"
tags: [bug, data-consistency, filesystem, server]
dependencies: []
---

# File Cleanup Ordering: Orphaned Uploads on Partial Failure

## Summary

In three deletion/replacement code paths, the database row is mutated **before**
the corresponding file is removed from disk. If the process crashes between the
DB write and the file unlink, the file is orphaned on disk with no reference in
the database. Over time, the `uploads/` directory accumulates unreachable files.

## Issues Found

### 1. `deleteApplication` — DB first, files second
**File:** `server/services/applications.js:268-285`

```js
function deleteApplication(userEmail, id) {
  const existing = getOwnApp(id, userEmail)
  if (!existing) throw new ServiceError(404, 'Not found')

  const attachments = db.prepare('SELECT stored_filename FROM attachments WHERE application_id = ?').all(id)
  const filesToDelete = attachments.map(a => a.stored_filename)
  if (existing.cv_path) filesToDelete.push(existing.cv_path)
  if (existing.cover_letter_path) filesToDelete.push(existing.cover_letter_path)

  db.prepare('DELETE FROM applications WHERE id = ? AND user_email = ?').run(id, userEmail)
  // <-- CRASH HERE leaves files orphaned

  for (const filename of filesToDelete) {
    const filePath = safePath(uploadsDir, filename)
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  return { success: true }
}
```

### 2. Attachment deletion — DB first, file second
**File:** `server/routes/applications.js:248-263`

```js
router.delete('/:id/attachments/:attachmentId', (req, res) => {
  // ...
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.attachmentId)
  db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id)
  // <-- CRASH HERE leaves file orphaned

  const filePath = safePath(uploadsDir, attachment.stored_filename)
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  // ...
})
```

### 3. CV / cover-letter replacement — DB first, old file second
**File:** `server/routes/applications.js:117-132` and `156-170`

```js
if (existing.cv_path) {
  const oldPath = safePath(uploadsDir, existing.cv_path)
  if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
}
// Wait: actually the current code deletes the old file BEFORE the DB update.
// Let's re-read...
```

Actually, re-reading lines 123-129:
```js
if (existing.cv_path) {
  const oldPath = safePath(uploadsDir, existing.cv_path)
  if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath)
}

db.prepare('UPDATE applications SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ? AND user_email = ?')
  .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id, req.userEmail)
```

This one is **file first, DB second** — which is the opposite problem: if the
unlink succeeds but the DB update fails, the application now references a deleted
file. This is arguably worse because it causes 404s for the user.

So we have:
- `deleteApplication`: DB first, files second (orphaned files)
- Attachment delete: DB first, file second (orphaned files)
- CV replacement: file first, DB second (broken references)

## Recommended Actions

The ideal pattern is:
1. Collect file paths to delete
2. Perform DB operation inside a transaction
3. If DB succeeds, delete files
4. If file deletion fails, log the error but do not fail the request

For **replacement** (CV/cover letter), the safest approach is:
1. Write new file to disk (multer already did this)
2. Update DB with new filename
3. Delete old file asynchronously after DB commit
4. If old-file delete fails, log for later cleanup

For **deletion** (application, attachment), the safest approach is:
1. Collect filenames
2. Delete DB row in transaction
3. After commit, delete files from disk
4. If a file delete fails, log it (the DB is the source of truth)

Additionally, consider a periodic **orphaned-file sweeper** that scans `uploads/`
and removes files not referenced by any row in `applications` or `attachments`.

- [ ] Add async file-deletion helper that logs failures instead of throwing
- [ ] Fix `deleteApplication` to delete files after DB commit
- [ ] Fix attachment deletion to delete file after DB commit
- [ ] Fix CV/cover-letter replacement to delete old file **after** DB update succeeds
- [ ] Add a one-off CLI script or startup scan to remove orphaned files in `uploads/`

## Acceptance Criteria

- [ ] All three deletion/replacement paths delete the DB record first, then the file
- [ ] File-deletion failures are logged but do not fail the HTTP request
- [ ] A sweeper script (or startup check) identifies and removes orphaned files
- [ ] Server tests verify that DB+file state is consistent after deletion
- [ ] No regression: existing upload/download flows still work

## Work Log

- 2026-04-23: Created from code-review data-consistency audit
