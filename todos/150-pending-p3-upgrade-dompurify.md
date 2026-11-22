# Upgrade `dompurify` 3.4.18 → 3.5.0 (client)

- **Priority:** p3
- **Created:** 2026-11-22
- **Category:** Maintenance (npm, client)

## Problem

`npm outdated` in `client/` reports a minor bump for `dompurify`. Not applied
automatically: the weekly dependency job applies no updates unattended, and
DOMPurify is the sanitiser for every markdown → `v-html` path, so a minor bump
deserves a deliberate look.

No advisory: `npm audit` reports 0 vulnerabilities.

## Current

- `dompurify`: 3.4.18 (in `client/` dependencies)
- Latest: **3.5.0**

## Proposed Solution

```bash
cd client && npm install dompurify@3.5.0
npm run lint && npm run test:e2e   # from repo root: npm run build:client first
```

Read the 3.5.0 release notes for changed default allow-lists.

- **Effort**: Small | **Risk**: Low-Medium (security-relevant sanitiser)

## Acceptance Criteria

- [ ] `cd client && npm ls dompurify` resolves to 3.5.0
- [ ] Markdown rendering (notes, job description) still sanitised; client tests and E2E pass
- [ ] Only `client/package.json` and `client/package-lock.json` changed
