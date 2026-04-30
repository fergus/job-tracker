---
status: complete
priority: p3
issue_id: "068"
tags: [performance, vue, computed, app]
dependencies: []
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# App.vue: displayApplications and closedCount scan applications twice

## Problem

`displayApplications` and `closedCount` are separate computed properties that each iterate the full `applications` array:

```js
const displayApplications = computed(() => {
  if (showClosed.value) return applications.value
  return applications.value.filter(a => !TERMINAL_STAGES.includes(a.status))
})

const closedCount = computed(() =>
  applications.value.filter(a => TERMINAL_STAGES.includes(a.status)).length
)
```

When `showClosed` is `false`, both computeds run and each performs an O(n) scan with the same predicate (inverted). At the current data size (≤200 apps) this is negligible, but it is unnecessary work and sets a precedent for redundant scans as the dataset grows.

This was noted in `062-complete-p2-feat-closed-column-review-fixes.md` (#8) but skipped because a naive derivation (`applications.value.length - displayApplications.value.length`) returns `0` when `showClosed` is `true` (since `displayApplications` is unfiltered in that case).

## Fix

Derive `closedCount` from a single pass without depending on `displayApplications`:

```js
const closedCount = computed(() => {
  let count = 0
  for (const a of applications.value) {
    if (TERMINAL_STAGES.includes(a.status)) count++
  }
  return count
})
```

This is still O(n) but removes the second array allocation and filter callback overhead. For a more thorough fix, combine both into a single computed that returns `{ displayApplications, closedCount }`, though that changes the component's interface pattern.

Alternatively, keep the current code — the cost is genuinely negligible for this app's data scale.

## Notes

- If combining into a single computed, note that `displayApplications` is passed to `TableView` and `TimelineView` while `closedCount` is used in the header and passed as a prop. A combined return object would require destructuring at the template level.
- The real win would come from caching the terminal predicate result if the application list grows to 500+ items.
