---
status: complete
priority: p3
issue_id: "042"
tags: [dependencies]
dependencies: []
---

# Upgrade marked from v17 to v18 (client)

## Problem Statement
`marked` in `client/` is at 17.0.6. Version 18.0.0 is now available as a major
release. Major releases may include breaking changes to the rendering API,
token types, or extension interfaces. The current code uses marked for rendering
markdown in job application notes; the upgrade should be verified against the
v18 migration guide before applying.

## Findings
- Current version: 17.0.6 (client/package-lock.json)
- Latest version: 18.0.2
- Upgrade type: major
- Migration guide: https://marked.js.org/

## Proposed Solutions
### Option A: Upgrade now
```bash
cd client && npm install marked@18
```
Review the v18 changelog and migration guide for breaking changes. Test markdown
rendering in the application notes UI to confirm no regressions.
- **Effort**: Small–Medium | **Risk**: Medium (major bump; check renderer API and extension changes)

## Acceptance Criteria
- [ ] `marked` upgraded to ^18.0.0 in client/package.json and package-lock.json
- [ ] Client build passes with no regressions
- [ ] Markdown rendering in the UI produces correct output
- [ ] No TypeScript / lint errors introduced

## Work Log
- 2026-04-12: Surfaced by weekly dependency update scan
- 2026-04-19: Weekly scan confirms still pending; latest now 18.0.2
