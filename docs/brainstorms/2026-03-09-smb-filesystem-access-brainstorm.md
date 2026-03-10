# Brainstorm: SMB Filesystem Access for Job Applications

**Date:** 2026-03-09
**Status:** Draft

## What We're Building

An SMB (Samba) network share that exposes job applications as a browsable, editable directory tree. Windows hosts can map it as a network drive (e.g., `\\docker.intervl.com\jobs`) to view and manage applications using standard tools — VS Code, nano, file explorer, or LLMs like Claude Code.

The share is served from the same Docker container as the Express API. A Node.js sync process maintains a real directory tree that mirrors the database, and Samba serves that directory over SMB. File changes made via SMB are detected with chokidar (inotify) and synced back to the API.

## Why This Approach

- **Samba + synced directory** is the simplest architecture: no FUSE kernel module, no custom Samba VFS plugin, just real files on disk that Samba serves natively.
- **Via HTTP API** (not direct SQLite) ensures all business logic is reused — status date auto-setting, validation, auth scoping.
- **Same container** keeps deployment simple — no sidecar orchestration.
- **chokidar** for change detection gives real-time sync with minimal complexity.

## Directory Structure

Applications are organized by status (pipeline stage). Each application is a directory named `{company}--{role}` (double-dash separator).

```
/smb-share/
├── interested/
│   └── google--senior-swe/
│       ├── details.md              # YAML frontmatter (company, role, URLs, salary) + description
│       ├── job-description.md      # large text field, separate file
│       ├── interview-notes.md      # large text field, separate file
│       ├── prep-work.md            # large text field, separate file
│       ├── notes/
│       │   ├── interested/
│       │   │   └── 1.md
│       │   └── screening/
│       │       └── 2.md
│       └── files/
│           ├── resume.pdf              # attachment
│           ├── cover-letter.pdf        # attachment
│           ├── offer-letter.pdf        # attachment
│           └── interview-prep.docx     # attachment
├── applied/
├── screening/
├── interview/
├── offer/
├── accepted/
└── rejected/
```

### File Formats

**details.md** — YAML frontmatter with structured fields:
```yaml
---
company: Google
role: Senior SWE
job_posting_url: https://careers.google.com/123
company_website_url: https://google.com
salary_min: 150000
salary_max: 200000
location: Remote
---

Free-form description or notes here.
```

**job-description.md, interview-notes.md, prep-work.md** — Plain markdown, content maps directly to the corresponding database text field.

**notes/{stage}/{id}.md** — Individual stage notes. Content is the note body.

## Key Decisions

1. **SMB via Samba, not FUSE** — Real files on disk served by Samba. No kernel modules or custom VFS plugins needed.
2. **Synced directory pattern** — Node.js process maintains a real directory tree mirroring the database. Two-way sync: API changes update files, file changes update API.
3. **Status change via `mv`** — Moving an application directory between status folders (e.g., `mv interested/google--swe/ interview/`) triggers a status change via the API.
4. **New application via `mkdir`** — `mkdir interested/acme--engineer/` creates a new application. Company and role are parsed from the directory name using `--` as separator.
5. **Double-dash separator** — `company--role` format for directory names. Avoids ambiguity with single dashes in company/role names.
6. **YAML frontmatter in details.md** — Structured fields in frontmatter, optional free-form content below. Editor-friendly and LLM-readable.
7. **Large text fields as separate files** — `job-description.md`, `interview-notes.md`, `prep-work.md` are separate from `details.md` for cleaner editing.
8. **Talks to Express API** — Sync process calls the HTTP API (not direct SQLite) to reuse all business logic.
9. **Same Docker container** — Samba and sync process run alongside Express in the existing container.
10. **chokidar for change detection** — Real-time filesystem watching to detect SMB edits.
11. **Generic file attachments** — All file uploads are generic attachments in a flat `files/` directory. This replaces the current CV/cover-letter-specific upload slots with a unified `attachments` table and API. Requires new database table and endpoints.
12. **SMB is opt-in** — SMB/Samba is disabled by default. Enabled via environment variable (e.g., `ENABLE_SMB=true`) in docker-compose.yml. When disabled, Samba is not started and no sync directory is created. The entrypoint script conditionally starts Samba and the sync process based on this flag. SMB-related config (Samba credentials, share path, SMB port) are also controlled via environment variables.

## Architecture

```
Windows Host                    Docker Container
                               ┌─────────────────────────────┐
 \\server\jobs ──SMB──────────>│  Samba                      │
                               │    ↕ (serves real files)    │
                               │  /data/smb-share/           │
                               │    ↕ (chokidar watches)     │
                               │  Sync Process (Node.js)     │
                               │    ↕ (HTTP calls)           │
                               │  Express API (:3000)        │
                               │    ↕                        │
                               │  SQLite (data/job-tracker.db)│
                               └─────────────────────────────┘
```

### Sync Flow

**API → Files (database changes reflected on disk):**
- On startup, full sync: query all applications, rebuild directory tree
- Periodic polling (e.g., every 30s) to catch changes made via web UI and keep files in sync

**Files → API (SMB edits reflected in database):**
- chokidar watches the share directory for file changes
- On `details.md` change: parse YAML frontmatter, call `PUT /api/applications/:id`
- On `job-description.md` change: call `PUT /api/applications/:id` with `job_description` field
- On directory rename/move between status folders: call `PATCH /api/applications/:id/status`
- On `mkdir` in a status folder: call `POST /api/applications` with parsed company/role
- On note file change: call `PUT /api/applications/:id/notes/:noteId`
- Debounce writes (e.g., 500ms) to avoid partial saves

## Resolved Questions

1. **Auth for SMB** — Samba user/password authentication. Each user gets credentials; their Samba username maps to their email for scoping API calls via `X-Forwarded-Email`.
2. **Conflict resolution** — Last write wins. No locking, no merge. Accept occasional data loss for simplicity.
3. **Delete semantics** — Deleting an application directory moves it to `rejected` status rather than truly deleting from the database. Safer and reversible.
4. **File upload via SMB** — All files live in a flat `files/` directory as generic attachments. No distinction between CV, cover letter, or other files at the filesystem level. **This requires extending the API** to support arbitrary file attachments (new `attachments` table, new upload/download endpoints), replacing the current CV/cover-letter-specific slots.
5. **Multi-user** — Per-user view. Each authenticated Samba user sees only their own applications. The sync process scopes API calls to that user's email.

## Open Questions

None remaining.

## Related Documents

- **Plan:** [docs/plans/2026-03-09-feat-smb-filesystem-access-plan.md](../plans/2026-03-09-feat-smb-filesystem-access-plan.md)
- **Lessons learned:** [docs/solutions/integration-issues/smb-filesystem-sync-implementation.md](../solutions/integration-issues/smb-filesystem-sync-implementation.md)
