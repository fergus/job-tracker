---
status: closed
priority: p2
issue_id: "062"
tags: [kanban, drag-drop, maintainability, vue, closed-column, ux]
dependencies: [061]
origin: code-review of 2026-04-24-001-feat-rejected-archive-and-quiet-plan.md
review_run: .context/compound-engineering/ce-code-review/20260425-014645-369bc251/
---

# Resolve code review findings (P2/P3): feat/rejected-archive-and-quiet

P2 and P3 findings from the closed-column feature review. Address after P1 blockers in `061-pending-p1-feat-closed-column-review-fixes.md` are resolved.

---

## P2 — Fix if straightforward

### 1. Drag cancel (Escape) removes card permanently until reload

**File:** `client/src/components/KanbanBoard.vue:278`

vuedraggable fires `evt.removed` on the Closed list when a drag is cancelled (Escape key, drop on invalid target). `onClosedChange` does not handle `evt.removed` — the card is removed from the active vuedraggable list but no `evt.added` fires. The card disappears from all draggable lists and cannot be interacted with until `loadApplications()` next runs.

**Fix:** Respond to `evt.removed` in `onClosedChange` by calling `loadApplications()` (or emitting a `reload` event) to resync the board. Alternatively, snapshot the pre-drag closed list and restore it on cancel.

```js
function onClosedChange(evt) {
  if (evt.removed) {
    // drag was cancelled or card moved to active column — resync
    emit('reload')
    return
  }
  if (!evt.added) return
  ...
}
```

- [x] **Fixed** — resolved by the 061 refactor. `onClosedChange` was removed; desktop now uses `columns.accepted`/`columns.rejected` as v-models directly. vuedraggable/Sortable.js handles drag cancellation natively and restores arrays automatically.

---

### 2. app.status === 'rejected' hardcoded in 3+ files — use TERMINAL_STAGES

**File:** `client/src/components/KanbanBoard.vue:117` (and TableView.vue, TimelineView.vue)

The quieting predicate `app.status === 'rejected'` is inlined across KanbanBoard (`:quiet` prop), TableView (row class), and TimelineView (span class + `segmentStyle`). `TERMINAL_STAGES` is now exported from `timeline.js`. If the definition of "what gets quieted" ever changes, every callsite needs updating.

**Fix:** Consider adding and exporting a helper:
```js
// client/src/utils/timeline.js
export function isQuieted(status) { return status === 'rejected' }
```
Or simply replace the string literals with `TERMINAL_STAGES.includes(app.status)` where appropriate (TableView and TimelineView), noting that the plan explicitly quiets only rejected (not accepted).

- [x] **Fixed** — added `isQuieted(status)` to `timeline.js` and replaced all inline `status === 'rejected'` checks in KanbanBoard, TableView, and TimelineView with `isQuieted(app.status)`.

---

### 3. pulseGhost animation persists when showClosed toggled true during pulse window

**File:** `client/src/components/KanbanBoard.vue:52`

`pulseGhost` is set true by a 1500ms timeout in App.vue. If the user toggles `showClosed` back to true before the timeout fires, the `animate-pulse` and `ring-accent` classes land on the now-visible column header — the full Closed column header animates unexpectedly.

**Fix:** Clear `pulseTimeout` and reset `pulseGhost` to false in `toggleShowClosed` when setting `showClosed` to true:

```js
function toggleShowClosed() {
  showClosed.value = !showClosed.value
  if (showClosed.value) {
    // Closed column is now visible — cancel any pending pulse
    if (pulseTimeout.value) clearTimeout(pulseTimeout.value)
    pulseGhost.value = false
  }
  lsSet(SHOW_CLOSED_KEY, String(showClosed.value))
}
```

- [x] **Fixed** — `toggleShowClosed` now clears the pending timeout and resets `pulseGhost` to `false` when the column is shown.

---

### 4. Undo toast action has no error handling

**File:** `client/src/App.vue:304`

The undo action lambda is `async () => { await updateStatus(id, prevStatus); ... }` with no try/catch. If this API call fails, it's an unhandled promise rejection.

**Fix:**
```js
action: async () => {
  try {
    await updateStatus(id, prevStatus)
    logoTrigger.value++
    await refreshApplication(id)
  } catch (err) {
    toast.error('Undo failed — ' + (err.response?.data?.error || err.message))
    await loadApplications()
  }
},
```

- [x] **Fixed** — resolved in 061. The undo action is wrapped in try/catch with `loadApplications()` fallback.

---

### 5. Closed drop zone has invisible tappable area when showClosed=false

**File:** `client/src/components/KanbanBoard.vue:60`

The Closed column's draggable container uses `v-show="showClosed"` (correctly keeps it mounted for vuedraggable). However, `min-h-[40px]` on the hidden element creates an invisible tappable surface. On touch devices, a tap or accidental drag near the ghost column header could interact with hidden cards.

**Fix:** Either remove the minimum height from the hidden drop target (rely on the ghost header above it to maintain column width), or add `pointer-events-none` when `showClosed` is false:
```html
<draggable ... :class="!showClosed ? 'pointer-events-none' : ''">
```

- [x] **Fixed** — removed `min-h-[40px]` from the container when `!showClosed`. The container now collapses to padding only, eliminating the invisible tappable box while keeping the draggable lists mounted for drag-to-hidden.

---

### 6. closedCount prop redundant in KanbanBoard

**File:** `client/src/components/KanbanBoard.vue:207`

KanbanBoard already holds `columns.accepted` and `columns.rejected`. `closedCount` is passed as a prop from App.vue but could be a local computed:

```js
const closedCount = computed(() => columns.accepted.length + columns.rejected.length)
```

Removing the prop simplifies the component's interface. Low priority — do alongside the dual-source-of-truth fix (#2 in 061) since that refactor changes how `columns.accepted`/`columns.rejected` are populated.

- [x] **Fixed** — resolved in 061. `closedCount` was never passed to KanbanBoard in App.vue; KanbanBoard already computes it locally.

---

### 7. Cards in "older" partition are silently undraggable

**File:** `client/src/components/KanbanBoard.vue:61`

When `showOlder` is false, cards older than 14 days are held in `columns.accepted`/`columns.rejected` but not rendered in any draggable list. They cannot be moved by drag with no indication that this is the case.

**Options:**
- Show the older section always (no collapse) — simplest
- Show a tooltip on the "Show N older" toggle explaining that older cards are not draggable
- Include older cards in the draggable list regardless of `showOlder` but visually collapse them with CSS (height: 0 + overflow: hidden)

- [ ] **Skipped (P3 advisory)** — older cards are hidden by design via `v-show` when collapsed. Users can expand the "Show N older" toggle to see and drag them. Adding a tooltip or always showing older cards would clutter the default view. This is acceptable UX as-is.

---

### 8. displayApplications and closedCount use two independent O(n) scans

**File:** `client/src/App.vue:199`

```js
const displayApplications = computed(() =>
  showClosed.value ? applications.value
    : applications.value.filter(a => !TERMINAL_STAGES.includes(a.status))
)
const closedCount = computed(() =>
  applications.value.filter(a => TERMINAL_STAGES.includes(a.status)).length
)
```

When `showClosed` is false, both computeds iterate `applications.value` with the same predicate. Derive `closedCount` from lengths:

```js
const closedCount = computed(() =>
  applications.value.length - displayApplications.value.length
)
```

This is a one-liner and removes the second O(n) scan.

- [ ] **Skipped** — the suggested derivation returns `0` when `showClosed` is `true` (because `displayApplications` is unfiltered), which breaks the Closed column header count. The O(n) scan is negligible for ≤200 apps and not worth introducing a conditional computed.

---

## P3 — Advisory (low priority, user's discretion)

### 9. hover:text-ink applied unconditionally to all KanbanCard company names

**File:** `client/src/components/KanbanCard.vue:10`

The `hover:text-ink transition-colors duration-200` class is in the static array — non-quiet cards (already at `text-ink`) see a no-op hover transition. The hover brightening only makes sense on quiet cards. Consider scoping it:

```js
['font-semibold font-condensed text-sm truncate',
  quiet ? 'text-ink-3 hover:text-ink transition-colors duration-200' : 'text-ink']
```

- [x] **Fixed** — already scoped correctly in current code. `hover:text-ink transition-colors duration-200` is only applied when `quiet` is true.

---

### 10. motion-safe: applied to static ring, removing outline for reduced-motion users

**File:** `client/src/components/KanbanBoard.vue:52`

The ghost header pulse likely uses something like:
```html
:class="{ 'motion-safe:animate-pulse motion-safe:ring-2 motion-safe:ring-accent': pulseGhost }"
```

`motion-safe:` on `ring-2` and `ring-accent` removes the static outline for users with `prefers-reduced-motion: reduce`. The plan says to gate the *animation* (not the static indicator). Fix: apply `motion-safe:` only to `animate-pulse`, keeping the ring unconditional:
```html
:class="{ 'ring-2 ring-accent motion-safe:animate-pulse': pulseGhost }"
```

- [x] **Fixed** — changed to `'ring-2 ring-accent motion-safe:animate-pulse'`. The static ring now renders unconditionally; only the pulse animation is gated behind `motion-safe`.

---

### 11. pulseTimeout should be a plain let, not a ref

**File:** `client/src/App.vue:194`

`const pulseTimeout = ref(null)` triggers Vue's reactivity system on every set/clear. The timer handle is never read in the template so the reactivity is wasted. Change to `let pulseTimeout = null` and remove `.value` at all callsites (lines 287-290 and the existing `onUnmounted`).

- [x] **Fixed** — changed `const pulseTimeout = ref(null)` to `let pulseTimeout = null` and removed `.value` from all callsites (`triggerGhostPulse`, `toggleShowClosed`, `onUnmounted`).

---

### 12. rebuildClosedApps allocates 3 new arrays on every applications prop update

**File:** `client/src/components/KanbanBoard.vue:246`

The watch that rebuilds `recentClosed`/`olderClosed` fires on every status change (each drag → API → refresh). At ≤200 apps this is harmless, but the Date.now() threshold is recomputed fresh each time with no caching. If the dual-source-of-truth fix (#2 in 061) is implemented using computed properties, this goes away automatically.

- [x] **Fixed** — resolved in 061. `rebuildClosedApps` and the `recentClosed`/`olderClosed` refs were removed entirely. Age partitioning is now computed inline via `isRecent()` inside `v-show`.

---

## Change log

| Date | Change | Files |
|------|--------|-------|
| 2026-04-25 | Added `isQuieted(status)` helper to `timeline.js` | `utils/timeline.js` |
| 2026-04-25 | Replaced hardcoded `status === 'rejected'` with `isQuieted` across all views | `KanbanBoard.vue`, `TableView.vue`, `TimelineView.vue` |
| 2026-04-25 | Cancel pending ghost pulse when `showClosed` toggled to true | `App.vue` |
| 2026-04-25 | Removed `min-h-[40px]` from hidden Closed drop target | `KanbanBoard.vue` |
| 2026-04-25 | Fixed motion-safe ring: only `animate-pulse` is gated, ring is static | `KanbanBoard.vue` |
| 2026-04-25 | Changed `pulseTimeout` from `ref` to plain `let` | `App.vue` |
