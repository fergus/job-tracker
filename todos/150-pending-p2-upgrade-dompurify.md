# Upgrade `dompurify` 3.4.18 → 3.5.0 (client) — sanitizer security fixes

- **Priority:** p2
- **Created:** 2026-11-28
- **Category:** Security (npm, client)
- **Bump type:** minor (3.4 → 3.5)

## Problem

`npm outdated` in `client/` reports a minor bump for `dompurify`. The weekly
dependency job only auto-applies patch-level updates (same `major.minor`), so
this was flagged rather than installed.

Priority is **p2, not p3**, because the upstream 3.5.0 release states outright
that it "contains security fixes" and that "there will be no further 3.4.x
release". DOMPurify is the only thing standing between user-authored markdown
(stage notes, contact interaction notes, job descriptions pasted from postings)
and `v-html`. Every rendered surface goes through it:

- `client/src/utils/markdown.js` — `renderMarkdown()` is the single funnel:
  `DOMPurify.sanitize(marked.parse(content))`
- Consumers of that output: `ApplicationPanel.vue` (stage notes, job
  description, generated-document preview) and `ContactPanel.vue`
  (interaction log)

`npm audit` reports **0 vulnerabilities** here — there is no published GHSA for
this one yet, which is exactly why it did not come through as a CVE finding.
That does not make it cosmetic: the fixes are bypass fixes in the sanitizer.

## What 3.5.0 fixes

- A `SAFE_FOR_TEMPLATES` bypass where nested tags could reassemble expressions
  on reparse
- Several ways for DOM-built input to get a template expression past
  `SAFE_FOR_TEMPLATES`: entity-encoded text in a `style` element nested in a
  `textarea`/`title`, text hidden in the children of a void element, NUL
  characters splitting a marker, and comments that end early on reparse
- Gaps in `IN_PLACE` fail-closed handling (rejected roots inside open shadow
  roots, failed calls)

## Exposure assessment (be honest about this)

This app calls plain `DOMPurify.sanitize(html)` with **default** configuration:
no `SAFE_FOR_TEMPLATES`, no `IN_PLACE`, no hooks, no `USE_PROFILES`. The
headline fixes above therefore sit on code paths this app does not use, so the
practical risk today is low. It is still worth taking — the remaining
hardening (clobbering checks, entity/void-element handling) applies to default
sanitization, and the 3.4 line is now closed to further fixes.

## Current

- `dompurify`: 3.4.18 installed (declared `^3.4.18`, `client/` dependencies)
- Latest: **3.5.0**
- Installed-copy check: `node -p "require('./client/node_modules/dompurify/package.json').version"` → `3.4.18`

## Proposed Solution

```bash
cd client
npm install dompurify@3.5.0
cd .. && npm run build:client
cd client && npm run test:e2e
```

`dompurify` ships its own types and has no native build, so no rebuild step is
needed. There are no direct unit tests for `renderMarkdown()` — check whether
`client/` has unit tests covering it and add a small one if not, since the
sanitizer is a security control and the E2E suite only exercises it indirectly.

Spot-check the four `v-html` surfaces with markdown that includes a table, a
fenced code block, a nested list, and an inline `<script>`/`onerror` attempt
(which must be stripped):

1. Application stage notes
2. Application job description
3. Generated-document preview
4. Contact interaction log

## Acceptance Criteria

- [ ] `cd client && npm ls dompurify` resolves to 3.5.0
- [ ] `npm run build:client` succeeds from the repo root
- [ ] `cd client && npm run test:e2e` passes
- [ ] All four `v-html` surfaces render markdown correctly, and an injected
      `<script>` / `onerror=` payload is stripped
- [ ] Only `client/package.json` and `client/package-lock.json` change for the
      package itself

- **Effort**: Small | **Risk**: Low–Medium (behaviour changes in a sanitizer; the sanitizer is on every rendered note, so verify the surfaces rather than trusting the build alone)
