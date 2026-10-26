# Upgrade multer 2.4.0 to 2.5.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-10-23
- **Category:** npm dependency (server)

## Problem

`multer` is pinned to `^2.4.0` in `server/package.json`; 2.5.0 is now available.
The bump is minor, so the weekly dependency check deferred it rather than
applying it automatically.

multer handles every multipart upload in the app — CV and cover-letter uploads
on `POST /api/applications`, attachment uploads, and the MCP `upload_attachment`
path — so a regression here is user-visible and worth its own change rather
than riding along with a weekly patch commit.

## Current

- Current version: 2.4.0
- Latest version: 2.5.0
- Direct dependency in `server/package.json`

## Proposed Solutions

### Option A: Upgrade to 2.5.0

```bash
cd server && npm install multer@2.5.0
npm test
```

Review the multer 2.5.0 release notes before applying. Worth explicitly
re-checking after the bump:

- the 10 MB `fileSize` limit still rejects oversized uploads
- the `.pdf / .doc / .docx / .md / .txt` extension filter still rejects others
- `safePath()` still resolves stored filenames correctly

The existing test suite covers multipart create and attachment upload; run it
rather than only eyeballing the diff.

- **Effort**: Small | **Risk**: Low-to-moderate (touches all upload paths)

## Acceptance Criteria

- [ ] `multer` at 2.5.0 in `server/package.json`
- [ ] `cd server && npm test` passes
- [ ] Manual check: create an application with a CV attachment via the UI
- [ ] Manual check: an oversized file (>10 MB) is still rejected with a 4xx

- **Resolved:** 2026-10-25 (npm audit fix; lockfile now hono 4.13.13 / follow-redirects 1.16.1 / multer 2.5.0, audit clean)
