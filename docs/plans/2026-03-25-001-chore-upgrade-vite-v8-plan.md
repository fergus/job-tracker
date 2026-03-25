---
title: Upgrade Vite v7 → v8
type: chore
status: active
date: 2026-03-25
origin: todos/033-pending-p3-upgrade-vite-v8.md
---

# Upgrade Vite v7 → v8

Bump Vite from `7.3.1` to `8.0.2` in the client. Research confirms this project's config is unaffected by all breaking changes — the upgrade is a one-liner with a build verification.

## Background

Vite 8 replaces the bundler stack (Rollup + esbuild → Rolldown + Oxc) for faster builds, but preserves the config API used by this project. The breaking changes only affect projects using `build.rollupOptions`, `optimizeDeps.esbuildOptions`, `esbuild` JSX config, or `build.commonjsOptions` — none of which are present here.

Sources: [Vite 8 Migration Guide](https://vite.dev/guide/migration) · [Announcing Vite 8](https://vite.dev/blog/announcing-vite8)

## Impact Assessment

| Area | Status | Notes |
|---|---|---|
| `client/vite.config.js` | ✅ No changes | Uses only `define`, `plugins`, `server.proxy` |
| `@vitejs/plugin-vue` v6 | ✅ Compatible | v6 supports Vite 8 |
| `@tailwindcss/vite` v4 | ✅ Compatible | Standard plugin hooks, unaffected |
| Node.js requirement | ✅ No change | Still Node 20.19+ / 22.12+ |
| Browser targets | ✅ Fine | Chrome 111+, Firefox 114+, Safari 16.4+ defaults |
| CSS minification | ✅ Auto | Switches to Lightning CSS — no config needed |
| Dev server proxy | ✅ Unaffected | `/api` → `:3000` proxy unchanged |

## Implementation

### Step 1 — Bump the package

```bash
cd client && npm install vite@latest
```

Verify the installed version:

```bash
node -p "require('./node_modules/vite/package.json').version"
```

### Step 2 — Test the dev server

```bash
npm run dev:client
```

- Confirm server starts on `:5173`
- Confirm `/api` proxy works (try loading the app)
- Watch for any deprecation warnings in the terminal

### Step 3 — Test the production build

```bash
npm run build:client
```

- Confirm `client/dist/` is generated without errors
- Check for any warnings about `rolldownOptions`, `oxc`, or removed options

### Step 4 — Commit, release, deploy

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: upgrade vite v7 -> v8"
```

Then run `/fs-release` (patch bump).

## Acceptance Criteria

- [ ] `client/package.json` references `vite@^8.x`
- [ ] `npm run dev:client` starts without errors or unexpected warnings
- [ ] `npm run build:client` produces `client/dist/` without errors
- [ ] Docker build passes in CI (`docker compose build`)
- [ ] Todo `033` marked complete

## Risk

**Low.** This project's `vite.config.js` uses none of the changed APIs. Rollback is `npm install vite@7` if anything unexpected surfaces.
