# Upgrade vite 8.2.2 → 8.3.0 (minor, client devDependency)

- **Priority:** p3
- **Created:** 2026-09-11
- **Category:** npm dependency (client, dev)

## Problem

`vite` is at `8.2.2` in `client/` (devDependency). Latest is `8.3.0` (minor bump — same major). Minor bumps are not auto-applied by the weekly dependency check.

## Current

`vite@8.2.2` (client, devDependency)

## Target

`vite@8.3.0`

## Proposed Fix

```bash
cd /home/fstevens/code/job-tracker/client && npm install -D vite@8.3.0
```

## Acceptance Criteria

- [ ] `client/package.json` references `^8.3.0`
- [ ] Client builds clean (`npm run build:client` from repo root — exercises all imports and compiles the full SPA)
- [ ] Client unit tests pass (`cd client && npm run test:unit`)
- [ ] Dev server still proxies `/api` to `localhost:3000` (`npm run dev:client`)

## Notes

- Previous vite upgrades: `072`, `081`, `090` (all in `todos/complete/`). `033-pending-p3-upgrade-vite-v8.md` tracked the v8 major.
- `@vitejs/plugin-vue` and `tailwindcss` are both ahead of vite here; if 8.3.0 requires a companion plugin bump, fold it into this todo rather than opening another.
