# Fix `follow-redirects` high-severity advisory (client, via axios)

- **Priority:** p2
- **Created:** 2026-11-06
- **Category:** Security (npm, client)

## Problem

`npm audit` in `client/` reports one **high** finding:

**GHSA-mrwp-f3q8-3g9p** — `follow-redirects`: cross-realm `sensitiveHeaders`
arrays are discarded and custom credentials can follow redirects. CVSS 5.9
(`AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N`), CWE-201, affected range
`>=1.16.0 <=1.16.1`. The consequence is credential leakage to a redirect
target — an `Authorization` header or custom credential surviving a hop it
should have been stripped from.

Installed copy and its parent:

```
axios@1.21.0
└── follow-redirects@1.16.1   # vulnerable
```

`axios` is a direct dependency of `client/` and is the only HTTP client the SPA
uses (`client/src/api.js`). Fixed in **1.16.2** (latest published).

**Exposure note:** the SPA calls only the app's own `/api` on the same origin,
over the oauth2-proxy session, so it does not attach credentials to
arbitrary cross-origin redirect targets in normal use. The realistic path to
this advisory is any code that follows an attacker-influenced redirect with
`axios` — for job-tracker that is limited, hence p2 rather than p1. The fix is a
lockfile-level bump inside axios's declared range, so it is cheap regardless.

This is a **client-only** advisory. `server/`'s `npm audit` is clean apart from
the `@hono/node-server` finding already tracked in
`todos/141-pending-p2-upgrade-hono-node-server-cve.md` — do not create a
duplicate for that here.

## Current

- `follow-redirects`: 1.16.1 (transitive, via `axios@1.21.0`)
- Fixed in: **1.16.2**
- `npm audit` reports `fixAvailable: true`

## Proposed Solution

### Option A: `npm audit fix` (preferred)

The fix sits inside axios's range, so this should be lockfile-only with no
direct dependency moving:

```bash
cd client
npm audit fix
npm ls follow-redirects     # expect 1.16.2
npm audit                   # expect the follow-redirects finding gone
cd .. && npm run build:client && cd client && npm run test:e2e
```

Confirm `git diff` touches only `client/package-lock.json`. If `audit fix` wants
to move `axios` itself, stop and use Option B.

### Option B: `overrides`

If the lockfile bump refuses to resolve:

```json
"overrides": { "follow-redirects": "^1.16.2" }
```

in `client/package.json`, then `npm install`, re-audit and re-build.

Do **not** reach for `npm audit fix --force` — in this tree it proposes
downgrading ESLint to 9.39.5, which is unrelated to this advisory and would
undo the ESLint 10 toolchain.

## Acceptance Criteria

- [ ] `cd client && npm ls follow-redirects` resolves to 1.16.2 or later
- [ ] `cd client && npm audit` no longer reports `follow-redirects`
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `npm run test:e2e` passes
- [ ] `axios` is still on 1.21.x (no direct dependency change)

- **Effort**: Small | **Risk**: Low (transitive lockfile bump inside the parent's declared range)

## Resolution — 2026-11-13

Closed by the weekly dependency pass, not by `npm audit fix`. Bumping `axios`
itself to its patch release did it: `axios@1.21.1` declares
`follow-redirects: ^1.16.2`, so the lockfile moved `follow-redirects` to
**1.16.3** (above the fixed 1.16.2 floor) as a side effect. No `overrides`
needed.

- `follow-redirects`: 1.16.1 → **1.16.3** (transitive)
- `axios`: 1.21.0 → **1.21.1** (patch, applied by the dependency job)
- `client/npm audit`: **0 high** findings, 5 → 4 total (the four remaining are
  the dev-only ESLint/minimatch moderates tracked in
  `142-pending-p3-upgrade-eslint.md`)
- `npm test` (server, 558 tests) and `npm run build:client` both pass
- Released as part of v0.28.3

All acceptance criteria met except `npm run test:e2e`, which was not run for
this pass — the change is a lockfile bump in an HTTP client's redirect handling
and the SPA build compiles clean, but the Playwright suite should cover it on
the next UI-touching change.
