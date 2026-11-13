# Upgrade `marked` 18.1.3 → 18.2.0 (client)

- **Priority:** p3
- **Created:** 2026-11-13
- **Category:** Maintenance (npm, client)

## Problem

`npm outdated` in `client/` reports a minor bump for `marked`. The weekly
dependency job only auto-applies patch-level updates (same `major.minor`), so
this was flagged rather than installed.

`marked` renders the markdown in stage notes, contact interaction notes and
generated documents. It is always paired with `dompurify` on the render path, so
a parser minor cannot by itself open an injection hole — but it can change which
HTML the sanitizer is handed, which is exactly the surface worth eyeballing.

## Current

- `marked`: 18.1.3 (declared in `client/` dependencies)
- Latest: **18.2.0**
- Bump type: minor (18.1 → 18.2), not automatically applied

## Proposed Solution

```bash
cd client
npm install marked@18.2.0
cd .. && npm run build:client
cd client && npm run test:e2e
```

Then skim the 18.2.0 release notes for tokenizer/renderer changes and spot-check
the three markdown surfaces by hand:

1. An application's stage notes (including a table, a fenced code block and a
   nested list)
2. A contact's interaction log
3. A generated document preview, which renders heavier markdown

Confirm DOMPurify is still applied to every `v-html` that carries marked output —
grep for `v-html` in `client/src/components/`.

## Acceptance Criteria

- [ ] `cd client && npm ls marked` resolves to 18.2.0
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `cd client && npm run test:e2e` passes
- [ ] The three markdown surfaces render as before (tables, code fences, lists
      intact, no raw HTML leaking through)
- [ ] Every marked → `v-html` path still passes through DOMPurify

- **Effort**: Small | **Risk**: Low (minor, sanitizer stays in the path)
