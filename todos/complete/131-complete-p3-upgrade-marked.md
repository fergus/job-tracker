# Upgrade marked 18.0.14 → 18.1.0 (minor, client)

- **Priority:** p3
- **Created:** 2026-10-09
- **Category:** npm dependency (client)

## Problem

`marked` is at `18.0.14` in `client/`. Latest is `18.1.0` (minor bump, same
major). It renders the markdown in notes and job descriptions (output is run
through `dompurify` before display). Not auto-applied.

## Current

- Current version: `18.0.14`
- Latest version: `18.1.0`

## Proposed Fix

```bash
cd client && npm install marked@18.1.0
```

Skim the `18.0 → 18.1` changelog (`https://github.com/markedjs/marked/releases`)
— minor bumps in `marked` have historically changed tokenizer output, so
sanitisation assumptions are worth a glance.

## Acceptance Criteria

- [ ] `client/package.json` references `^18.1.0`
- [ ] `npm run build:client` (from repo root) succeeds
- [ ] A note with headings, lists, links and a code block renders correctly
      (and remains sanitised) in the application panel

## Notes

- Tracked previously in `042-complete-p3-upgrade-marked-v18.md` — this is the
  next bump on the 18.x line.
- Because `dompurify` runs after `marked`, the rendering path is defence-in-depth;
  still verify output on a note with raw HTML in it.
