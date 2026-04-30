---
title: "TimelineView today boundary stale after midnight"
date: "2026-04-30"
category: "ui-bugs"
module: "Timeline View"
problem_type: "ui_bug"
component: "frontend_stimulus"
severity: "low"
symptoms:
  - "TimelineView's right-hand boundary remains anchored to the previous day if the tab is left open past midnight"
root_cause: "logic_error"
resolution_type: "code_fix"
tags:
  - "vue"
  - "timeline"
  - "stale-data"
  - "setInterval"
  - "date-boundary"
---

# TimelineView today boundary stale after midnight

## Problem

`TimelineView` computed the right-hand timeline boundary from a `const today = new Date().toISOString()` assigned once at component mount. If a user leaves the tab open overnight, the boundary remains anchored to the previous calendar day, making the timeline visually incorrect.

## Symptoms

- Timeline "today" marker and future-boundary shading are off by one or more days after midnight
- Only visible after the tab has been open across a date boundary; refreshing the page temporarily fixes it

## What Didn't Work

- Static `const` assignment at module or setup scope — no reactivity, no periodic refresh
- Option A from the original analysis (a computed `computed(() => new Date().toISOString())`) was rejected because it would re-evaluate on every render cycle, potentially causing excessive re-computation if other reactive updates trigger renders frequently

## Solution

**Before:**

```js
const today = new Date().toISOString()
```

**After:**

```js
const today = ref(new Date().toISOString())
let dateInterval

onMounted(() => {
  dateInterval = setInterval(() => {
    const now = new Date().toISOString()
    if (now.slice(0, 10) !== today.value.slice(0, 10)) {
      today.value = now
    }
  }, 60_000)
})

onUnmounted(() => {
  clearInterval(dateInterval)
})
```

All consumers of `today` were updated from `today` to `today.value`:

```js
const minDate = computed(() => {
  if (!props.applications?.length) return today.value
  // ...
})

const maxDate = computed(() => today.value)

function getSegments(app) {
  return computeSegments(app, today.value)
}
```

## Why This Works

- Converting `today` to a `ref` makes it reactive; any computed or template dependency on `today` automatically re-evaluates when the date changes
- A 60-second polling interval is cheap and reliable. Comparing `slice(0, 10)` avoids unnecessary re-renders when the date hasn't crossed a boundary
- `onUnmounted` cleanup prevents memory leaks and dangling intervals when the component is destroyed

## Prevention

- **Treat wall-clock boundaries as reactive, not static.** Any UI that depends on "today," "this week," or "this month" should use a live date source if long-lived sessions are expected
- **Use `setInterval` + date-slice comparison for infrequent boundary changes.** This is more efficient than updating a ref every second when only the day boundary matters
- **Always pair `setInterval` with `onUnmounted` cleanup.** Missing cleanup is a common source of memory leaks in SPA components

## Related Issues

- Origin: code review `.context/compound-engineering/ce-code-review/20260425-014645-369bc251/`
- Plan: `docs/plans/2026-04-24-001-feat-rejected-archive-and-quiet-plan.md`
- Todo: `todos/complete/067-complete-p3-timeline-stale-midnight-boundary.md`
