# Upgrade supertest 7.2.2 → 7.3.0 (minor, server dev)

- **Priority:** p3
- **Created:** 2026-09-26
- **Category:** npm dependency (server, devDependency)

## Problem

`supertest` is pinned at `^7.2.2` in `server/devDependencies`. Latest is `7.3.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

`supertest` is the HTTP assertion library the backend test suite (`server/test/api.test.js`) is built on, so the whole test suite is the acceptance test here.

## Current

`supertest@7.2.2` (server, devDependency)

## Target

`supertest@7.3.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/server && npm install --save-dev supertest@7.3.0
```

Watch the `superagent` / `formidable` transitive range — supertest bumps often move those, and `npm install` will surface a conflict if the range is unsatisfiable.

## Acceptance Criteria

- [ ] `server/package.json` references `^7.3.0` for `supertest`
- [ ] Server tests pass (`cd server && npm test`) — all 437 tests green
- [ ] Multipart upload tests (the `.attach()` cases) still pass, since supertest drives the form encoding

## Notes

- `npm audit` is currently clean in both trees (0 vulnerabilities), so there is no CVE driving this.
