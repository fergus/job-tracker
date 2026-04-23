---
status: open
priority: p2
issue_id: "046"
tags: [ux, kanban, table, filtering]
dependencies: []
---

# Archive / Filter Rejected Applications

## Problem

Rejected applications accumulate in the board and table, adding noise to the active pipeline view. Users need them out of the way day-to-day but still accessible for review and reflection.

## What to build

### 1. Default filter — hide rejected from main views
- Board, Table, and Timeline views should hide `rejected` (and optionally `accepted`) applications by default
- A toggle or count badge ("+ 12 rejected") lets the user reveal them inline without switching views

### 2. Count / summary — always visible
- Show a small stat somewhere (header or footer of the relevant column/view) like "12 rejected" so the number is never invisible even when they're filtered out
- Clicking it reveals the full list

### 3. Full list review
- Revealing rejected applications should work in all three views (Board column re-appears, Table rows re-appear, Timeline entries re-appear)
- Persistent toggle state (localStorage) so the user's preference survives refresh

## Notes

- Consider whether `accepted` should be treated the same way — likely yes, as a separate "closed" category
- Don't remove the Rejected column from the board entirely; just collapse/hide it with a count badge
- Settings panel could also expose a global "show closed applications" toggle as an alternative approach
