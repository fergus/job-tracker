# Upgrade `vite` 8.3.8 → 8.4.0 (client, dev/build)

- **Priority:** p3
- **Created:** 2026-11-28
- **Category:** Maintenance (npm, client build tooling)
- **Bump type:** minor (8.3 → 8.4)

## Problem

`npm outdated` in `client/` reports a minor bump for `vite`. The weekly
dependency job only auto-applies patch-level updates (same `major.minor`), so
this was flagged rather than installed.

`vite` builds the shipped SPA (`npm run build:client`) and serves the dev
server with the `/api` proxy to `localhost:3000`. It is a build-time dependency:
it ends up in the bundle only as its runtime helpers, and it is not present in
the production Express server. No security advisories are attached
(`npm audit`: 0 vulnerabilities in `client/`), so this is a keep-current item.

Released 2026-11-26, two days before this check — the patch line it follows
(8.3.8) landed 2026-11-11.

## Current

- `vite`: 8.3.8 installed (declared `^8.3.8`, `client/` devDependencies)
- Latest: **8.4.0**
- Related: `@vitejs/plugin-vue` and `@tailwindcss/vite` ride alongside Vite and
  have their own peer ranges — check whether the bump pulls either forward.

## Proposed Solution

```bash
cd client
npm install -D vite@8.4.0
cd .. && npm run build:client
cd client && npm run test:e2e
```

The build is the real gate. Two things in this repo are sensitive to the
bundler:

1. **CSP** — `server/app.js` serves a strict Content-Security-Policy (no
   external scripts). A Vite minor that changes how preload/module tags are
   emitted, or starts inlining a script, would surface as a CSP violation. The
   E2E console guard fails any test that logs a browser console error, CSP
   violations included, so the suite should catch it.
2. **Tailwind 4** — `@tailwindcss/vite` is a Vite plugin with its own Vite peer
   range; confirm `npm ls vite` shows a single deduped copy after the install
   rather than a nested one.

Also confirm the dev server still proxies `/api` to `:3000` (`npm run
dev:client`) — a proxy regression is invisible to the build and the E2E suite,
which run against a built client.

## Acceptance Criteria

- [ ] `cd client && npm ls vite` resolves to 8.4.0 with no duplicate nested copy
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `npm run dev:client` still proxies `/api` to `localhost:3000`
- [ ] `cd client && npm run test:e2e` passes with no CSP console errors
- [ ] Only `client/package.json` and `client/package-lock.json` change for the
      package itself

- **Effort**: Small | **Risk**: Low (build tooling; verified by build + E2E + dev proxy check)
