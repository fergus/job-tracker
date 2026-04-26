---
status: closed
priority: p2
issue_id: "064"
tags: [ui, kanban, closed-column, ux, drag-drop]
dependencies: [061, 062]
---

# Closed Column Desktop Improvements

## Problems addressed

1. **Invisible drop targets** — the desktop Closed column showed accepted and rejected cards in a single undivided zone with no sub-labels. When the column was expanded with no recent cards, there was no visible indication of where to drop.

2. **"Show x older" button jumped** — clicking the link caused older cards to expand above it, pushing the button down the page. Users lost their visual anchor.

3. **DOM duplication** — after the initial older-cards fix, older cards existed twice in the DOM: hidden inside the draggable lists (`v-show=false`) and visible in a static list below the button. This caused accessibility issues and wasted component instances.

4. **Drop zones broken when column hidden** — wrapping draggables in `v-show="showClosed"` divs caused `boundingBox()` to return `null`, breaking the hidden-state drag-to-Closed E2E test.

## What was built

- Added Accepted and Rejected sub-headers (coloured dot, label, count) to the desktop Closed column, matching the mobile layout
- Restructured "Show x older": recent cards in draggable lists, older cards rendered once in a static section below the button — button stays anchored
- Closed-column draggables use `recentClosedAccepted` / `recentClosedRejected` refs (recent-only) so older cards appear only once in the DOM
- Removed `v-show="showClosed"` from draggable wrapper divs; moved it to sub-headers and card items instead, keeping draggables always mounted

## Change log

| Date | Change | Files |
|------|--------|-------|
| 2026-04-26 | Added Accepted/Rejected sub-headers to desktop Closed column | `KanbanBoard.vue` |
| 2026-04-26 | Restructured older cards to expand below the "Show x older" button | `KanbanBoard.vue` |
| 2026-04-26 | Added `recentClosedAccepted`/`recentClosedRejected` refs to eliminate DOM duplication | `KanbanBoard.vue` |
| 2026-04-26 | Moved `v-show` off draggable wrappers onto sub-headers and card items; fixed hidden-state drag E2E test | `KanbanBoard.vue` |
