---
title: "showClosed toggle drag guard and panel close synchronization"
date: "2026-04-30"
category: "ui-bugs"
module: "Closed Column UI"
problem_type: "ui_bug"
component: "frontend_stimulus"
severity: "medium"
symptoms:
  - "Closed column drop zone shrinks mid-drag when showClosed is toggled, causing dragged card to snap back"
  - "Application detail panel remains open after showClosed becomes false because close is deferred to nextTick"
root_cause: "async_timing"
resolution_type: "code_fix"
tags:
  - "vue"
  - "draggable"
  - "showClosed"
  - "nextTick"
  - "async-timing"
---

# showClosed toggle drag guard and panel close synchronization

## Problem

The `showClosed` toggle and the Closed column drop zone interact dangerously with draggable state and open detail panels. Two related bugs:

1. **Drag guard:** On desktop, the Closed column drop zone container conditionally applies `min-h-[60px] bg-sunken` vs `min-h-0` based on `showClosed`. If the user toggles the header button while dragging a card, the drop zone shrinks mid-flight. `vuedraggable` / Sortable.js recalculates hit coordinates on mouse/touch move; a reactive reflow can cause the dragged card to miss the zone and snap back to its origin.

2. **Panel close timing:** When `showClosed → false`, a watcher deferred `showPanel = false` via `nextTick`. Between the toggle and the next tick, `showPanel` remained `true` while the application was no longer in `displayApplications`, leaving the panel in an inconsistent transient state where async side-effects could fire against it.

Both issues stem from the same root cause: reactive state transitions that are not synchronized with the UI operations they affect.

## Symptoms

- Dragged card snaps back to original column when `showClosed` is toggled during an active drag
- Detail panel remains visible for a few milliseconds after its application is filtered out by `showClosed`, causing flicker or stale data access
- Race between reactive DOM reflow and Sortable.js hit-testing on desktop

## What Didn't Work

- Relying solely on Vue's reactive rendering to keep the drop zone stable during drag; DOM geometry changes under Sortable.js mid-drag are unsafe
- Using `nextTick(() => { showPanel.value = false })` to batch UI updates; the deferral creates a window where downstream logic thinks the panel is still valid
- The `nextTick` wrapper was introduced in the original closed-column feature diff with no documented rationale for why synchronous close would be unsafe (session history)

## Solution

**KanbanBoard.vue:**

```vue
<script setup>
const dragActive = ref(false)

watch(dragActive, (val) => {
  emit('drag-active', val)
})

function handleToggle() {
  if (dragActive.value) return
  emit('toggle-show-closed')
}
</script>

<template>
  <!-- on all 4 draggable zones -->
  <draggable
    @start="dragActive = true"
    @end="dragActive = false"
    ...
  >
  ...
  <button
    :disabled="dragActive"
    @click="handleToggle"
    class="... disabled:opacity-50 disabled:cursor-not-allowed"
  >
    ...
  </button>
</template>
```

**App.vue:**

```vue
<script setup>
const dragActive = ref(false)

function toggleShowClosed() {
  if (dragActive.value) return
  showClosed.value = !showClosed.value
  lsSet(SHOW_CLOSED_KEY, String(showClosed.value))
}

watch(showClosed, (visible) => {
  if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
    showPanel.value = false   // synchronous — no nextTick
  }
})
</script>

<template>
  <KanbanBoard
    @drag-active="dragActive = $event"
    ...
  />
  <button
    :disabled="dragActive"
    @click="toggleShowClosed"
    class="... disabled:opacity-50 disabled:cursor-not-allowed"
  >
    ...
  </button>
</template>
```

## Why This Works

- Disabling the toggle and guarding the handler with `dragActive` prevents any reactive state change that would alter the drop zone's geometry while Sortable.js is tracking pointer coordinates
- Closing the panel synchronously in the watcher eliminates the transient "open panel for invisible app" state. Vue's reactivity batching is sufficient; `nextTick` added an unnecessary and harmful delay
- Emitting drag-state events from KanbanBoard keeps the child component encapsulated while allowing the parent to participate in layout safety

## Prevention

- **Never mutate layout-critical reactive state mid-drag.** If a property controls the size, visibility, or scroll position of a drop zone, guard its mutations with drag-state flags
- **Avoid `nextTick` for state cleanup that must be atomic with the triggering condition.** Use `nextTick` only when you genuinely need to wait for DOM updates (e.g., focusing an element after conditional rendering); for simple boolean flags, synchronous assignment is safer
- **Emit drag-state events from child components.** Encapsulated drag components should surface `drag-active` so parent layout controls can participate without reaching into the child

## Related Issues

- Origin: code review `.context/compound-engineering/ce-code-review/20260425-014645-369bc251/`
- Plan: `docs/plans/2026-04-24-001-feat-rejected-archive-and-quiet-plan.md`
- Todo: `todos/complete/065-complete-p2-guard-showClosed-toggle-during-drag.md`, `todos/complete/066-complete-p3-panel-close-nextTick-race.md`
