---
status: complete
priority: p3
issue_id: "033"
tags: [dependencies]
dependencies: []
---

# Upgrade Vite v7 → v8

## Problem Statement
Vite has a new major version available. Skipped during routine dependency updates as major bumps may have breaking changes.

## Findings
- Current version: 7.3.1
- Latest version: 8.0.2
- Upgrade type: major
- Location: client

## Proposed Solutions
### Option A: Upgrade now
Review the [Vite 8 migration guide](https://vite.dev/guide/migration), run `npm install vite@latest` in `client/`, verify the dev server and production build pass, then release.
- **Effort**: Small–Medium | **Risk**: Medium (major version)

## Acceptance Criteria
- [x] `client/package.json` references vite 8.x
- [x] `npm run dev:client` starts without errors
- [x] `npm run build:client` succeeds with no regressions
