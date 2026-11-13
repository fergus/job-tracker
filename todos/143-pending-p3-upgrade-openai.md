# Upgrade `openai` 7.45.1 → 7.56.0 (server + client)

- **Priority:** p3
- **Created:** 2026-11-06
- **Updated:** 2026-11-13 (latest moved on from 7.53.0)
- **Category:** Maintenance (npm, server + client)

## Problem

`npm outdated` reports a minor bump for `openai` in **both** `server/` and
`client/`. The weekly dependency job only auto-applies patch-level updates
(same major.minor), so this was flagged rather than installed.

The package is present in both trees as a direct dependency:

- `server/` — used for document generation / job-description extraction
- `client/` — declared alongside the Vue deps (browser-side calls are proxied
  through the API, so check whether the client copy is actually imported before
  assuming it ships in the bundle)

This is one dependency **and one update**, not two. Bump both lockfiles in the
same change so the two copies do not drift apart.

## Current

- `openai`: 7.45.1 (declared `^7.45.1`) in `server/` and `client/`
- Latest: **7.56.0**
- No advisories currently attached to `openai` itself; this is a
  keep-current item, not a security fix.

## Proposed Solution

```bash
cd server  && npm install openai@7.56.0
cd ../client && npm install openai@7.56.0
```

Then verify the surfaces that actually call the SDK, since minor releases of
`openai` have historically moved response shapes and default retry/timeout
behaviour:

```bash
cd server && npm rebuild better-sqlite3 && npm test
cd .. && npm run build:client
```

Manual checks worth doing beyond the test suite:

- Generate a document through the application panel (the highest-value path
  using the SDK)
- Fetch a job description by URL (`fetch_job_description` / the REST equivalent)

## Acceptance Criteria

- [ ] `npm ls openai` reports 7.56.0 in **both** `server/` and `client/`
- [ ] `cd server && npm test` passes
- [ ] `npm run build:client` succeeds from the repo root
- [ ] One document generation completes against a real application record
- [ ] Only the four package/lock files for the bump are changed

- **Effort**: Small | **Risk**: Low–Medium (SDK minor; exercised by tests and the generation path)
