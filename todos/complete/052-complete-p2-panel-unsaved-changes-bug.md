---
status: complete
priority: p2
issue_id: "052"
tags: [bug, ui, client, vue]
dependencies: []
---

# ApplicationPanel: Unsaved Changes Prompt Misses Salary and Status

## Summary

The `isDirty()` function in `ApplicationPanel.vue` determines whether to show the
"Unsaved changes" confirmation when the user tries to close the panel. It only
checks text fields (`company_name`, `role_title`, `job_description`, etc.) and
completely ignores `salary_min`, `salary_max`, and `status`. Users who edit these
fields and accidentally click the backdrop lose their changes silently.

## Issues Found

### 1. `isDirty()` ignores salary fields
**File:** `client/src/components/ApplicationPanel.vue:614-627`

```js
function isDirty() {
  const a = props.panelApp || {}
  if (!isEdit.value) {
    return !!(form.company_name || form.role_title)
  }
  return (
    form.company_name !== (a.company_name || '') ||
    form.role_title !== (a.role_title || '') ||
    form.job_description !== (a.job_description || '') ||
    form.job_posting_url !== (a.job_posting_url || '') ||
    form.company_website_url !== (a.company_website_url || '') ||
    form.job_location !== (a.job_location || '')
  )
}
```

Missing checks:
- `form.salary_min` vs `a.salary_min`
- `form.salary_max` vs `a.salary_max`
- `form.status` vs `a.status`

### 2. Create-mode dirty check is too narrow
**File:** `client/src/components/ApplicationPanel.vue:616-617`

```js
if (!isEdit.value) {
  return !!(form.company_name || form.role_title)
}
```

In create mode, filling in `job_description`, URLs, or salary and then closing
the panel does not trigger the confirmation if `company_name` and `role_title`
are still empty. This is inconsistent UX.

### 3. Status changes via status bar are saved immediately
**File:** `client/src/components/ApplicationPanel.vue:647-677`

`onStatusClick()` calls `updateStatus()` immediately and emits `'saved'`. The
status is persisted to the server before the user hits "Save Changes". This is
by design, but it means `isDirty()` doesn't need to track status for the save
button — yet it *should* track it for the close prompt, because the user might
have clicked a status by accident and not want to persist it.

Since `updateStatus()` is already called, the status is already saved. So the
real fix is: either make `isDirty()` aware that status is auto-saved (and exclude
it), or make `isDirty()` comprehensive and add a note that status is live-saved.
The salary fields, however, are definitely lost.

## Recommended Actions

- [x] Add `salary_min` and `salary_max` to `isDirty()` comparison
- [x] `status` is excluded from `isDirty()` because `onStatusClick()` persists it immediately; documented inline
- [x] Expand create-mode dirty check to include any non-empty field

## Acceptance Criteria

- [x] Changing `salary_min` or `salary_max` and clicking the backdrop shows the
  "Unsaved changes" prompt
- [x] Changing `status` auto-saves immediately via `onStatusClick()`; no data loss on close
- [x] In create mode, filling any field and closing triggers the prompt
- [x] Existing dirty-check behaviour for text fields is unchanged
- [x] Client build passes; no Vue warnings

## Work Log

- 2026-04-23: Created from code-review UX audit of `ApplicationPanel.vue`
- 2026-04-23: Fixed `isDirty()` to compare `salary_min`, `salary_max`, and all
  create-mode fields. Status excluded with inline comment (auto-saved). Client
  build and server tests pass (56/56).
