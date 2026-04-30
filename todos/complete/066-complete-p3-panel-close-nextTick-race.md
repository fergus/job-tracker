---
status: complete
priority: p3
issue_id: "066"
tags: [vue, reactivity, panel, closed-column]
dependencies: []
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# Panel close deferred to nextTick leaves stale reference window

## Problem

When the user hides closed applications (`showClosed → false`), App.vue's watcher defers `showPanel = false` to `nextTick`:

```js
watch(showClosed, (visible) => {
  if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
    nextTick(() => {
      showPanel.value = false
    })
  }
})
```

Between the toggle and the next tick, `showPanel` is still `true` while the app is no longer in `displayApplications`. If `ApplicationPanel` initiates any side-effect work on open (e.g. fetching notes, setting focus), that work starts in the deferred tick and cannot be cancelled when the panel closes a moment later.

In practice this is sub-render timing and unlikely to cause visible bugs, but any async side-effects fired against the closing panel are not cancellable.

## Where

- `client/src/App.vue:217-223`

## Fix options

**Option A — Close synchronously:**
```js
watch(showClosed, (visible) => {
  if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
    showPanel.value = false
  }
})
```
The `nextTick` deferral was likely added to let a leave transition start. If `ApplicationPanel` has no leave transition, the synchronous close is safe and removes the race window entirely.

**Option B — Guard side-effects in ApplicationPanel:**
If the panel has async init work, add an `onUnmounted` cleanup or an `isOpen` guard so in-flight requests are dropped when the component unmounts.

**Option C — Keep nextTick but add abort:**
```js
watch(showClosed, (visible) => {
  if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
    nextTick(() => {
      if (!showClosed.value) {  // re-check in case user toggled back
        showPanel.value = false
      }
    })
  }
})
```

## Notes

- Verify whether `ApplicationPanel` currently has a leave transition. If not, Option A is the cleanest fix.
- The `nextTick` was introduced in the closed-column feature diff; check the commit message for the original rationale.
