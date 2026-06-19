---
status: complete
priority: p3
issue_id: "072"
tags: [dependencies]
dependencies: []
---

# Upgrade vite 8.0.14 → 8.0.15

## Problem Statement
A patch release of vite is available. Skipped at time of check because it was published <48h ago (2026-06-01T04:14:26Z). Provenance is GitHub Actions OIDC-signed.

## Findings
- Current version: 8.0.14
- Latest version: 8.0.15
- Upgrade type: patch
- Safety: Publisher verified (GitHub Actions OIDC provenance). Update age at time of check: ~20h ⚠️
- Direct dependency in `client/`

## Proposed Solutions
### Option A: Upgrade now
```bash
cd client && npm install vite@8.0.15
```
Verify build passes, then release.
- **Effort**: Small | **Risk**: Low

## Acceptance Criteria
- [ ] vite upgraded to 8.0.15 in `client/`
- [ ] Build passes with no regressions
