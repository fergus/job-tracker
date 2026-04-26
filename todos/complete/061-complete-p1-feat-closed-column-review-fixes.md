---
status: closed
priority: p1
issue_id: "061"
tags: [kanban, drag-drop, reliability, vue, closed-column]
dependencies: []
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# Resolve code review findings: feat/rejected-archive-and-quiet

Code review of the closed-column / show-hide / visual-quieting feature flagged 17 remaining findings after 1 safe_auto fix was applied (localStorage crash in Safari private browsing — already fixed in working tree).

This todo tracks the P1 blockers. P2/P3 issues are in `062-pending-p2-feat-closed-column-review-fixes.md`.

---

## P1 — Must fix before shipping

### 1. Mobile scroll-to-Closed broken (single nextTick insufficient)

**File:** `client/src/components/KanbanBoard.vue:304`

`handleToggle` emits `toggle-show-closed`, awaits one `nextTick`, then reads `closedGroupRef.value?.scrollIntoView`. The Closed group div is rendered via `v-if="showClosed"` on mobile. After the emit, the parent (App.vue) updates `showClosed.value` → prop propagates to KanbanBoard → child template re-renders → callback ref fires. Two Vue scheduler ticks are required for the full propagation chain (parent flush + child patch). A single `nextTick` is not enough; `closedGroupRef.value` is still `null` when `scrollIntoView` is called. The scroll silently does nothing.

**Fix:**
```js
// Option A — double nextTick
async function handleToggle() {
  emit('toggle-show-closed')
  await nextTick()
  await nextTick()
  closedGroupRef.value?.scrollIntoView({ behavior: 'smooth' })
}

// Option B — watch the ref (more robust)
watch(closedGroupRef, (el) => {
  if (el) el.scrollIntoView({ behavior: 'smooth' })
}, { once: true }) // reset with each toggle via watch options
```

Remove the async scroll from `handleToggle` if using Option B — make it a plain `emit` only.

- [x] **Fixed** — implemented double `nextTick` in the `watch(() => props.showClosed)` handler so the ref is bound before scrolling.

---

### 2. Dual source of truth: recentClosed/olderClosed vs columns.accepted/columns.rejected

**File:** `client/src/components/KanbanBoard.vue:246`

The watch on `props.applications` populates four refs: `columns.accepted`, `columns.rejected`, `recentClosed`, and `olderClosed`. The desktop Closed column uses `recentClosed`/`olderClosed` as vuedraggable v-models; the mobile column uses `columns.accepted`/`columns.rejected`. vuedraggable mutates its v-model arrays in place on drag. After any drag:

- Desktop drag mutates `recentClosed`/`olderClosed` but NOT `columns.accepted`/`columns.rejected` → mobile count badge is stale
- Mobile drag mutates `columns.accepted`/`columns.rejected` but NOT `recentClosed`/`olderClosed` → desktop partition is stale

Between drag-end and the server round-trip completing, all four arrays are inconsistent.

**Fix options:**
- **Simplest:** use `columns.accepted` and `columns.rejected` as the single v-model everywhere (both desktop and mobile). Derive `recentClosed`/`olderClosed` as computed getters from those two refs for display-only partitioning (not as separate draggable v-models).
- **Alternative:** merge accepted + rejected into a single `closedAll` ref as the v-model, and partition visually via a computed within the template.

- [x] **Fixed** — desktop Closed column now uses two draggable lists v-modeled to `columns.accepted` and `columns.rejected` (same arrays mobile uses). Age-based partitioning is applied via `v-show` with `isRecent(element) || showOlder`. Removed the separate `closedApps` ref and `partitionClosed` dependency.

---

### 3. partitionClosed uses wrong date field for accepted apps

**File:** `client/src/components/KanbanBoard.vue:256`

```js
const dateStr = app.rejected_at || app.accepted_at || app.updated_at
```

For a `status='accepted'` app: `rejected_at` is null → `accepted_at` is tried. If `accepted_at` is null (legacy records, direct edits), falls back to `updated_at`. For a `status='rejected'` app that was previously accepted: `rejected_at` is null but `accepted_at` may be set — the accepted date is used for partition, which is wrong.

The plan specifies: *"Use `rejected_at` for rejected apps and `accepted_at` for accepted apps to determine age; fall back to `updated_at`."*

**Fix:**
```js
const dateStr = app.status === 'rejected'
  ? (app.rejected_at || app.updated_at)
  : (app.accepted_at || app.updated_at)
```

- [x] **Fixed** — the current codebase already uses `closed_at || updated_at` via `partitionClosed` (and the DB schema sets `closed_at` for both accepted and rejected). Replaced `partitionClosed` with inline `daysSinceClosed` that preserves the same `closed_at || updated_at` semantics.

---

### 4. handleStatusChange has no error handling — API failure leaves board out of sync

**File:** `client/src/App.vue:293`

```js
async function handleStatusChange(id, status) {
  const prevStatus = applications.value.find(a => a.id === id)?.status
  await updateStatus(id, status)   // ← no try/catch; throws on 4xx/5xx/network error
  logoTrigger.value++
  await refreshApplication(id)
  ...
}
```

vuedraggable has already moved the card locally when this fires. If `updateStatus` throws, `refreshApplication` never runs and the board is permanently out of sync with the server until the user reloads the page.

**Fix:**
```js
async function handleStatusChange(id, status) {
  const prevStatus = applications.value.find(a => a.id === id)?.status
  try {
    await updateStatus(id, status)
  } catch (err) {
    toast.error('Failed to update status — ' + (err.response?.data?.error || err.message))
    await loadApplications()  // re-sync board to server truth
    return
  }
  logoTrigger.value++
  await refreshApplication(id)
  ...
}
```

Also wrap the undo action (line 305) in a try/catch for the same reason.

- [x] **Fixed** — added try/catch around `updateStatus` in `handleStatusChange`. On failure: toast error, `loadApplications()` re-sync, and `statusVersion.value++` to clear in-flight IDs. Undo action also wrapped in try/catch with the same fallback.

---

### 5. No UI rollback when drag-to-Closed API call fails

**File:** `client/src/components/KanbanBoard.vue:278`

When the API call fails (covered by fix #4 above), `loadApplications()` re-syncs the board. However, between the drag-end and the reload completing, the card is in the wrong visual state. If using the fix from #4, this is automatically resolved by `loadApplications()`. No additional KanbanBoard-level rollback is needed if App.vue's error handler reloads the applications list.

**Status:** Resolved by fix #4 if App.vue calls `loadApplications()` in the catch handler.

- [x] **Fixed** — resolved by the error handling in #4. `loadApplications()` re-syncs the board to server truth on any API failure.

---

### 6. Race: card dragged back before API responds → split-brain state

**File:** `client/src/components/KanbanBoard.vue:278`

A user can drag a card to Closed, then immediately drag it back to an active column before the PATCH completes. vuedraggable moves it to the active column locally, then `handleStatusChange` sets `status='rejected'`, then `refreshApplication` fires and writes `status='rejected'` to `applications.value`, which rebuilds columns and moves the card back to Closed — even though the user explicitly dragged it back.

**Fix:** Track in-flight card IDs. In `onClosedChange`, add the card ID to a `Set<string>` before emitting. Clear it in `handleStatusChange`'s finally block. In active-column `onChange`, skip the emit if the card is in the in-flight set.

```js
// KanbanBoard.vue
const inFlight = new Set()

function onClosedChange(evt) {
  if (!evt.added) return
  const app = evt.added.element
  if (TERMINAL_STAGES.includes(app.status)) return
  inFlight.add(app.id)
  emit('status-change', app.id, 'rejected')
}

// App.vue handleStatusChange — clear in-flight in finally
async function handleStatusChange(id, status) {
  try { ... } catch { ... } finally {
    // signal KanbanBoard to clear in-flight — via prop or event
  }
}
```

This is a design question (how to propagate the in-flight signal from App.vue back to KanbanBoard). Simpler alternative: disable drag on cards whose ID is in the in-flight set via the vuedraggable `:move` callback.

- [x] **Fixed** — implemented `inFlightIds` as a reactive `Set` in KanbanBoard. All drag handlers (`onActiveChange`, `onAcceptedAdded`, `onRejectedAdded`) skip the emit if the card ID is already in-flight. App.vue increments a `statusVersion` prop on both success and error; KanbanBoard watches this and clears the in-flight set.

---

## Change log

| Date | Change | Files |
|------|--------|-------|
| 2026-04-25 | Mobile scroll fix: double `nextTick` before `scrollIntoView` | `KanbanBoard.vue` |
| 2026-04-25 | Unified data model: desktop Closed column uses `columns.accepted`/`columns.rejected` v-models with `v-show` age partitioning | `KanbanBoard.vue` |
| 2026-04-25 | Added `daysSinceClosed` / `isRecent` helpers replacing `partitionClosed` | `KanbanBoard.vue` |
| 2026-04-25 | Error handling in `handleStatusChange` with `loadApplications()` fallback and toast | `App.vue` |
| 2026-04-25 | Undo action wrapped in try/catch | `App.vue` |
| 2026-04-25 | In-flight drag tracking via `inFlightIds` + `statusVersion` prop | `KanbanBoard.vue`, `App.vue` |
| 2026-04-25 | Updated E2E tests to match corrected drag-to-Closed behavior | `kanban-drag.spec.js` |
