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

**Audit note (2026-11-06):** `npm audit` in `client/` reports a moderate
**GHSA-g3hv-75wg-m249** finding — `minimatch` has a potential denial of service
via globparts amplification, range `>=7.0.0 <11.0.1`, present here as
`minimatch@10.2.6` pulled in by `eslint@10.13.0` and
`@eslint/config-array@0.23.5`. The fixed release is `11.0.1`, a **major** bump
that ESLint 10 does not accept, so npm's suggested resolution is to *downgrade*
to `eslint@9.39.5` — which is not a fix, it is a rollback, and it is why
`npm audit fix --force` must not be run in this tree.

Do not open a separate todo for this: it is the same toolchain and it closes
when ESLint ships a release that moves `minimatch` to 11.x. Take the 10.14.0
bump now; re-check `npm audit` after each subsequent ESLint release and close
this todo once the minimatch finding is gone rather than when 10.14.0 lands.
Dev-only tooling, no runtime exposure.

**Re-checked 2026-11-13:** unchanged — `eslint@10.13.0`,
`@eslint/config-array@0.23.5`, `minimatch@10.2.6`, and npm still proposes the
`eslint@9.39.5` rollback as the "fix". Numbers in this todo are current; the
`globals` and `eslint-plugin-vue` bumps that ride alongside ESLint are tracked in
`145-pending-p3-upgrade-globals.md` and were applied at patch level where
possible (`eslint-plugin-vue@10.12.1`).

- **Effort**: Small | **Risk**: Low (dev dependency; verified by lint + client build)

## Acceptance Criteria

- [ ] `cd client && npm ls eslint` resolves to 10.14.0
- [ ] Lint passes with no new errors (or new findings are fixed)
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `client/package.json` and `client/package-lock.json` are the only files changed
