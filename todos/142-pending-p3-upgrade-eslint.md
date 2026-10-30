# Upgrade ESLint 10.13.0 → 10.14.0 (client)

- **Priority:** p3
- **Created:** 2026-10-31
- **Category:** Maintenance (npm, client)

## Problem

`npm outdated` in `client/` reports a minor bump for ESLint. Not applied
automatically: the weekly dependency job only auto-applies patch-level updates,
and lint tooling minors can change rule defaults and surface new errors across
the SPA.

ESLint is dev-only — it is not part of the shipped image — so there is no
runtime or security impact, only lint behaviour.

## Current

- `eslint`: 10.13.0 (declared `^10.13.0`, in `client/` devDependencies)
- Latest: **10.14.0**
- Also in the graph: `@eslint/js`, `eslint-plugin-vue` and `globals`. Check
  whether the bump drags any of these forward; `eslint-plugin-vue` is the one
  that must keep pace with the ESLint core version.

## Proposed Solution

```bash
cd client && npm install -D eslint@10.14.0
npm run lint          # if a lint script exists; otherwise `npx eslint src`
cd .. && npm run build:client
```

Review the release notes for 10.14.0 first — if it promotes a rule to `error`
under a preset the project uses, either fix the findings or pin the preset rule
back off in the flat config.

- **Effort**: Small | **Risk**: Low (dev dependency; verified by lint + client build)

## Acceptance Criteria

- [ ] `cd client && npm ls eslint` resolves to 10.14.0
- [ ] Lint passes with no new errors (or new findings are fixed)
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `client/package.json` and `client/package-lock.json` are the only files changed
