# Upgrade mammoth 1.12.3 to 1.13.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-09-27
- **Category:** npm dependency (server)

## Problem

`mammoth` is at `^1.12.3` in `server/`. Latest is `1.13.0` (minor bump, same major).
It was deferred on 2026-09-27 because 1.13.0 was published less than 48 hours
earlier (2026-09-26T22:11Z) and carries no npm provenance attestation. mammoth
parses user-uploaded .docx files at runtime, so a compromised release would run
against untrusted input on the server.

## Current

- Current version: 1.12.3
- Latest version: 1.13.0
- Safety: no provenance; published 2026-09-26T22:11Z (under 24h old at time of check)

## Proposed Solutions

### Option A: Upgrade once the release is more than 48h old

```bash
cd server && npm install mammoth@1.13.0
```

Recheck `npm view mammoth time --json` for a newer patch first, and skim the
upstream changelog.

- **Effort**: Small | **Risk**: Low

## Acceptance Criteria

- [x] `server/package.json` references `^1.13.0`
- [x] Server tests pass (`cd server && npm test`)
- [x] .docx text extraction still works on an uploaded CV or cover letter
