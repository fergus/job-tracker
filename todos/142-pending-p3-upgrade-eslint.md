# Upgrade ESLint 10.15.0 → 10.16.0 (server + client)

- **Priority:** p3
- **Created:** 2026-10-31
- **Updated:** 2026-11-28 (latest now 10.16.0; minimatch advisory closed)
- **Category:** Maintenance (npm, server + client dev tooling)

## Problem

`npm outdated` reports a minor bump for ESLint in **both** `server/` and
`client/`. Not applied automatically: the weekly dependency job only auto-applies
patch-level updates, and lint tooling minors can change rule defaults and surface
new errors across the codebase.

ESLint is dev-only — not part of the shipped image — so there is no runtime
impact, only lint behaviour.

## Current

- `server/`: `eslint` 10.15.0 installed, declared `^10.15.0`
- `client/`: `eslint` 10.15.0 installed, declared `^10.13.0`
- Latest: **10.16.0**
- Related in the client graph: `@eslint/js@10.0.1`,
  `eslint-plugin-vue@10.12.1`, `vue-eslint-parser@10.4.2`, `globals@17.13.0`
  (the `globals` bump is tracked in `145-pending-p3-upgrade-globals.md`).
  `eslint-plugin-vue` is the one that must keep pace with the ESLint core.

## Audit note — resolved

The earlier version of this todo carried a moderate **GHSA-g3hv-75wg-m249**
finding on `minimatch` (globparts amplification DoS), which reached the tree via
`eslint@10.13.0` → `@eslint/config-array@0.23.5` → `minimatch@10.2.6`. The fix
(`minimatch@11.0.1`) was a major bump ESLint 10 did not accept, so npm proposed
downgrading to `eslint@9.39.5`.

**That is now closed.** As of 2026-11-28 the client graph resolves
`minimatch@11.0.9` via `eslint@10.15.0` → `@eslint/config-array@0.23.6`, and
`npm audit` reports **0 vulnerabilities** in both trees. Nothing to chase here
beyond the routine minor bump.

## Proposed Solution

Sequence this **with** `145-pending-p3-upgrade-globals.md` — one toolchain, one
install run.

```bash
cd server && npm install -D eslint@10.16.0 && npm run lint
cd ../client && npm install -D eslint@10.16.0 globals@17.14.0 && npx eslint src
cd .. && npm run build:client
```

Review the 10.16.0 release notes first. If it promotes a rule to `error` under a
preset the project uses, either fix the findings or pin the rule back off in the
flat config — do not let the lint gate go red on the release that carries this.

## Acceptance Criteria

- [ ] `npm ls eslint` resolves to 10.16.0 in **both** `server/` and `client/`
- [ ] `cd server && npm run lint` passes
- [ ] Client lint passes with no new errors (or new findings are fixed)
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `npm audit` still reports 0 vulnerabilities in both trees

- **Effort**: Small | **Risk**: Low (dev dependency; verified by lint + client build)
