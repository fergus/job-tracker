# Upgrade `globals` 17.13.0 → 17.14.0 (client, dev)

- **Priority:** p3
- **Created:** 2026-11-06
- **Category:** Maintenance (npm, client dev tooling)

## Problem

`npm outdated` in `client/` reports a minor bump for `globals`, the package that
supplies the ESLint flat-config global name lists (browser/node globals). Not
applied automatically because it is a minor bump.

Dev-only, no runtime or security impact. The practical risk is the opposite of a
breakage: a new minor adds newly-standard globals, so `no-undef` may *stop*
firing on code that was previously flagged — worth a lint run to confirm nothing
in `src/` was silently relying on an undeclared global.

## Current

- `globals`: 17.13.0 (declared `^17.13.0`, `client/` devDependencies)
- Latest: **17.14.0**

## Proposed Solution

Sequence this **with** `todos/142-pending-p3-upgrade-eslint.md` rather than
separately — ESLint, `@eslint/js`, `eslint-plugin-vue` and `globals` are one
toolchain and a single `npm install -D` run keeps them consistent.

```bash
cd client && npm install -D globals@17.14.0
npx eslint src
cd .. && npm run build:client
```

## Acceptance Criteria

- [ ] `cd client && npm ls globals` resolves to 17.14.0
- [ ] Lint passes with no new errors
- [ ] `npm run build:client` succeeds from the repo root
- [ ] The ESLint toolchain versions are internally consistent (`eslint`,
      `@eslint/js`, `eslint-plugin-vue`, `globals`)

- **Effort**: Small | **Risk**: Low (dev dependency; verified by lint + build)
