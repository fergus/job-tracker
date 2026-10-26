# Upgrade mammoth 1.12.3 to 1.13.0 (minor, server)

- **Priority:** p3
- **Created:** 2026-09-27
- **Updated:** 2026-10-09
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

## Notes

- `npm audit` on `server/` also reports three **moderate** advisories on this
  tree, all transitive through `mammoth`:
  - `argparse` (GHSA-? , via `sprintf-js`, range `1.0.0 - 1.0.10`)
  - `sprintf-js` (GHSA-hp3w-g68c-fv3c, unbounded precision DoS, CVSS 5.3)
  - `mammoth` itself is listed as "vulnerable" only because it depends on the
    above; npm's suggested fix is a *downgrade* to `mammoth@0.3.29`, which is
    not appropriate.
  - Verify after upgrading: `cd server && npm audit` — if `argparse`/`sprintf-js`
    survive the 1.13.0 bump, the fix is a lockfile-only `npm update argparse
    sprintf-js` (or an `overrides` entry), since mammoth 1.x has not moved off
    argparse 1.x.
- `mammoth` is the only reader of user-uploaded `.docx` files, so this tree
  handles untrusted input — worth clearing rather than deferring indefinitely.

## Acceptance Criteria

- [x] `server/package.json` references `^1.13.0`
- [x] Server tests pass (`cd server && npm test`)
- [x] .docx text extraction still works on an uploaded CV or cover letter
- [ ] `cd server && npm audit` no longer lists `argparse` / `sprintf-js` / `mammoth`
