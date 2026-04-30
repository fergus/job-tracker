---
title: "closedCount double array scan"
date: "2026-04-30"
category: "performance-issues"
module: "Application List"
problem_type: "performance_issue"
component: "frontend_stimulus"
severity: "low"
symptoms:
  - "Two O(n) computed properties scan the full applications array on every reactive update when showClosed is false"
root_cause: "logic_error"
resolution_type: "code_fix"
tags:
  - "vue"
  - "computed"
  - "performance"
  - "optimization"
  - "array-allocation"
---

# closedCount double array scan

## Problem

`displayApplications` and `closedCount` were separate computed properties in `App.vue`. When `showClosed` is false, both run on every `applications` array change. Each computed performed a full O(n) scan with inverted predicates (`filter` for display, `filter().length` for count). For large application lists, this doubles the iteration cost unnecessarily.

## Symptoms

- Two independent O(n) scans of the same array on every reactive update
- `filter().length` allocates an intermediate array and invokes a callback per element when only a scalar count is needed

## What Didn't Work

- Deriving `closedCount` from `applications.value.length - displayApplications.value.length` was rejected because it returns `0` when `showClosed` is `true` (since `displayApplications` is unfiltered in that case)
- This was previously flagged in `062-complete-p2-feat-closed-column-review-fixes.md` (#8) but skipped with flawed reasoning (session history)
- Keeping the `filter().length` approach — functionally correct but wasteful

## Solution

**Before:**

```js
const closedCount = computed(() =>
  applications.value.filter(a => TERMINAL_STAGES.includes(a.status)).length
)
```

**After:**

```js
const closedCount = computed(() => {
  let count = 0
  for (const a of applications.value) {
    if (TERMINAL_STAGES.includes(a.status)) count++
  }
  return count
})
```

## Why This Works

- A `for...of` loop avoids allocating an intermediate array and invoking a callback function for every element
- The loop is still O(n) but with lower constant factors: no array allocation, no callback overhead, and better cache locality
- `displayApplications` and `closedCount` now use independent, optimal implementations rather than sharing an inverted predicate via two `filter` calls

## Prevention

- **When you only need a scalar count, prefer `for...of` over `filter().length`.** `filter()` allocates a new array and calls a predicate function for every element — wasted work when the array is immediately discarded
- **Audit paired computeds for redundant scans.** If two computed properties iterate the same reactive array with related predicates, consider whether one can be derived more efficiently or whether both can share a single pass
- **For large reactive arrays, consider derived memoization.** If `applications` grows to 500+ items and updates frequently, a single combined computed that returns `{ displayApplications, closedCount }` would eliminate all redundant scanning. This changes the component interface pattern but may be worth it at scale

## Related Issues

- Origin: code review `.context/compound-engineering/ce-code-review/20260425-014645-369bc251/`
- Plan: `docs/plans/2026-04-24-001-feat-rejected-archive-and-quiet-plan.md`
- Todo: `todos/complete/068-complete-p3-closedCount-double-scan.md`
- Related: `todos/complete/062-complete-p2-feat-closed-column-review-fixes.md` (#8)
