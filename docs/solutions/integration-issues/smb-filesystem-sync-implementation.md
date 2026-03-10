---
title: "SMB Filesystem Sync Implementation Lessons"
date: 2026-03-10
category: integration-issues
tags:
  - sync-engine
  - two-way-sync
  - feedback-loop
  - smb
  - docker
  - file-permissions
  - multer
  - type-coercion
  - chokidar
  - file-watching
modules:
  - server/lib/sync-engine.mjs
  - server/smb-sync.mjs
  - docker-entrypoint.sh
  - server/middleware/auth.js
  - server/routes/applications.js
---

# SMB Filesystem Sync Implementation Lessons

Five problems solved while building a two-way sync between an Express API and an SMB-shared filesystem (Samba + chokidar + Docker).

## Related Documents

- **Plan:** [docs/plans/2026-03-09-feat-smb-filesystem-access-plan.md](../../plans/2026-03-09-feat-smb-filesystem-access-plan.md)
- **Brainstorm:** [docs/brainstorms/2026-03-09-smb-filesystem-access-brainstorm.md](../../brainstorms/2026-03-09-smb-filesystem-access-brainstorm.md)
- **Open issues:** todos/020 (binary hash corruption), todos/021 (auth bypass), todos/022 (timing-safe comparison), todos/023 (path traversal)

---

## 1. Two-Way Sync Feedback Loop Prevention

### Symptom

Infinite loop: sync engine writes a file from the API, chokidar fires a `change` event, engine pushes it back to the API, which triggers another write.

### Root Cause

In a bidirectional sync, every file the engine writes to disk triggers a chokidar event. Without distinguishing engine-originated writes from user edits, the watcher treats every write as a user change.

### Solution

Three layers of protection in `server/lib/sync-engine.mjs`:

**Layer 1 — `syncing` flag:** Suppresses all watcher events during `fullSync()`.

**Layer 2 — `lastWrittenHashes` Map:** Records the SHA-256 hash of every file the engine writes. Before processing a chokidar event, `shouldSkipSync()` compares the file's current hash against the stored hash:

```js
// Writing from API (lines 342-356)
writeFromApi(filePath, content) {
  const hash = sha256(content);
  if (fs.existsSync(filePath)) {
    try {
      const existing = readFileNoFollow(filePath);
      if (sha256(existing) === hash) {
        this.lastWrittenHashes.set(filePath, hash);
        return;
      }
    } catch {}
  }
  fs.writeFileSync(filePath, content);
  this.lastWrittenHashes.set(filePath, hash);
}

// Guard check (lines 544-552)
shouldSkipSync(filePath) {
  try {
    const content = readFileNoFollow(filePath);
    const hash = sha256(content);
    return this.lastWrittenHashes.get(filePath) === hash;
  } catch {
    return false;
  }
}
```

**Layer 3 — `lastKnownFrontmatter` Map:** For `details.md`, tracks parsed frontmatter and only sends fields that actually differ, preventing no-op API calls.

### Prevention

- Any system that both writes files and watches for changes **must** have self-echo suppression designed in from the start. This is not an edge case.
- Prefer content hashing over timestamps (FAT32 has 2-second granularity, NFS has clock skew).
- Add a circuit breaker: if the same file triggers >N events in T seconds, pause and log a warning.

### Warning Signs

- CPU spikes with no user activity
- Logs showing the same file processed repeatedly
- File timestamps advancing without user changes

---

## 2. Read-Only SMB File Permissions (umask)

### Symptom

Files appeared in the SMB share but couldn't be edited. Permissions showed `-rw-r--r--` (644).

### Root Cause

The sync engine process uses the default umask (`022`), which strips group-write. SMB users are in the `nodejs` group but can't write because group-write is masked off.

### Solution

Set `umask 0002` in `docker-entrypoint.sh` before launching the sync process:

```sh
# Set umask so sync-engine-created files are group-writable (0664/0775)
umask 0002

# Start sync process in background
su-exec nodejs node /app/server/smb-sync.mjs &
```

The SMB user is added to the `nodejs` group:
```sh
adduser -D -H -s /sbin/nologin -G nodejs "$SMB_USER" 2>/dev/null || true
```

### Prevention

- Set umask explicitly in entrypoint scripts. The default 022 is rarely correct for shared-write scenarios.
- Document the expected permission model for any service writing to shared storage.
- Test file creation permissions as part of initial setup, not after user reports.

### Warning Signs

- "Permission denied" bugs that only appear on network mounts, never in local dev
- Entrypoints that never mention umask
- Services running as root (masks the problem since root bypasses permission checks)

---

## 3. Orphaned Multer Uploads

### Symptom

Uploaded files accumulated on disk with no database reference after failed ownership checks.

### Root Cause

Express multer middleware writes files to disk *before* the route handler runs. If the handler's ownership check fails and returns 404, the files are already on disk — orphaned forever.

### Solution

Clean up `req.files` on every early-exit path:

```js
router.post('/:id/attachments', upload.array('files', 10), (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) {
    // Clean up files multer already wrote to disk
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    return res.status(404).json({ error: 'Not found' });
  }
  // ...
});
```

### Prevention

- Treat file uploads as two-phase: accept, then validate+commit or rollback.
- Audit every upload route for all exit points (validation failure, auth failure, DB error).
- Consider uploading to a temp directory first, moving to permanent storage only after validation.
- Add a scheduled cleanup job that scans uploads for files not referenced by any DB row.

### Warning Signs

- Uploads directory grows monotonically even when applications are deleted
- Routes that return 4xx after multer runs with no `fs.unlink` in sight

---

## 4. Empty String to Number Coercion

### Symptom

Salary showing as "$0" when users hadn't entered a value.

### Root Cause

JavaScript's `Number('')` evaluates to `0`, not `NaN`. In multipart form submissions, empty fields arrive as `''`. Without an explicit check, blank salary fields silently become 0 in the database.

### Solution

Check for empty string before calling `Number()`:

```js
let salary_min = (req.body.salary_min != null && req.body.salary_min !== '')
  ? Number(req.body.salary_min) : null;
let salary_max = (req.body.salary_max != null && req.body.salary_max !== '')
  ? Number(req.body.salary_max) : null;
```

This only affects multipart routes (multer). JSON routes receive `null` for empty values.

### Prevention

- Never pass form data values directly to `Number()` without checking for empty strings.
- Create a shared utility:
  ```js
  function parseNumericField(value) {
    if (value === '' || value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isNaN(num) ? null : num;
  }
  ```
- Remember: `Number('')` is `0` and `isNaN('')` is `false`. Both are traps.

### Warning Signs

- Numeric columns containing suspicious 0 values
- Code that does `Number(req.body.x)` without guards
- Optional numeric form fields with no empty-string handling

---

## 5. Internal Auth Token for Sync Engine

### Symptom

Sync engine couldn't authenticate API calls — it runs inside the container without oauth2-proxy.

### Root Cause

In production, the auth middleware rejects `X-Forwarded-Email` headers without oauth2-proxy's `X-Forwarded-User` header. The sync engine needs to make trusted API calls on behalf of a user.

### Solution

Generate a random token at container startup, share via environment variable:

```sh
# docker-entrypoint.sh
INTERNAL_AUTH_TOKEN=$(head -c 32 /dev/urandom | od -A n -t x1 | tr -d ' \n')
export INTERNAL_AUTH_TOKEN
```

Auth middleware trusts requests carrying the token:

```js
// server/middleware/auth.js
} else if (internalToken && internalAuthToken && internalToken === internalAuthToken) {
  // Trusted internal request from sync engine
  req.userEmail = email.toLowerCase();
```

The three-part condition ensures the check is skipped entirely when `INTERNAL_AUTH_TOKEN` is unset (`internalAuthToken` is `null`). Token is generated fresh on each container start and never persisted.

### Prevention

- Design internal service-to-service auth from the start when adding background processes.
- Generate tokens from `/dev/urandom`, never hardcode.
- Clear credentials from environment after use (`unset SMB_PASS`).

---

## Code Review Checklist

Derived from these issues — check on every PR:

1. Does any file-writing code set or document its expected umask?
2. Does any file-watcher code have echo suppression?
3. Does every early-exit path in upload routes clean up files?
4. Does every `Number()` call on user input guard against empty strings?
