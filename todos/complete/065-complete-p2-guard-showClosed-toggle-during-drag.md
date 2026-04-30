---
status: complete
priority: p2
issue_id: "065"
tags: [kanban, drag-drop, vue, closed-column, ux]
dependencies: []
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# Guard showClosed toggle during active drag

## Problem

The Closed column drop zone on desktop reacts to `showClosed` while a drag is in progress. The container class switches between `min-h-[60px] bg-sunken` (showClosed=true) and `min-h-0` (showClosed=false). If the user toggles the header button during a drag, the drop zone shrinks mid-flight. Sortable.js recalculates hit coordinates on mousemove/touchmove; a reactive reflow can cause the dragged card to miss the zone and snap back, or the drag ghost to disappear with no feedback.

This is reachable on touch devices where the header toggle and drag surface are both visible simultaneously.

## Where

- `client/src/components/KanbanBoard.vue:40` — reactive class binding on the closed column container
- `client/src/App.vue:58-67` — toggle button has no drag-in-progress guard

## Fix options

**Option A — Disable toggle while dragging:**
Track a `dragInProgress` ref in KanbanBoard (set on `@start`, clear on `@end`). Pass it up to App.vue or emit an event so the toggle button can be `:disabled="dragInProgress"`.

**Option B — Keep consistent drop zone geometry:**
Always apply `min-h-[60px]` to the closed drop zone regardless of `showClosed`, and use `v-show` only for card visibility. The zone stays the same size so Sortable.js hit tests remain stable.

```html
<!-- KanbanBoard.vue -->
<div :class="['space-y-4 rounded-lg p-2 min-h-[60px]', showClosed ? 'bg-sunken' : '']">
```

**Option C — Pointer-events lock:**
Add `pointer-events-none` to the toggle button while any draggable in the board is active. This is the lightest touch but less explicit than Option A.

## Notes

- Option B is simplest and preserves the existing visual collapse (bg-sunken disappears, but min-height stays).
- Verify that keeping min-height when `showClosed=false` does not create unwanted empty space in the layout.
