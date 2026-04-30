---
status: complete
priority: p3
issue_id: "067"
tags: [timeline, date, vue, reactivity]
dependencies: []
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# TimelineView `today` is captured at setup time — stale after midnight

## Problem

`const today = new Date().toISOString()` is assigned once when `TimelineView` mounts. If a user leaves the tab open overnight, the timeline's right-hand boundary stays anchored to the previous day. Any bar extending to "today" will appear to overshoot the axis, and month tick labels will be misaligned.

This is a pre-existing issue that becomes more visible as the timeline feature is used for longer sessions.

## Where

- `client/src/components/TimelineView.vue:88`
- `client/src/components/TimelineView.vue:98` — `maxDate` is a computed of the constant `today`

## Fix

Replace the static `const` with a computed or a ref updated by an interval:

```js
// Option A — computed (simplest, re-evaluates on every render)
const today = computed(() => new Date().toISOString())

// Option B — ref + interval (updates without interaction)
const today = ref(new Date().toISOString())
const dateInterval = setInterval(() => {
  today.value = new Date().toISOString()
}, 60_000) // update every minute
onUnmounted(() => clearInterval(dateInterval))
```

Option A is sufficient because Vue re-renders on reactive changes anyway; the computed will refresh on the next render cycle. Option B is overkill unless the timeline is expected to animate the boundary in real time.

## Notes

- `computeSegments` and `pctOf` both consume `today`. Ensure the change does not introduce excessive re-computation on every mouse move (tooltip updates should not trigger segment recomputation).
- If switching to `computed`, verify that `minDate` and `maxDate` computeds do not create an unstable dependency chain that re-renders the whole timeline on every second.
