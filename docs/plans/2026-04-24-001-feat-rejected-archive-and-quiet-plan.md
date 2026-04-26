---
title: "feat: Archive / filter rejected applications + visual quieting"
type: feat
status: draft
date: 2026-04-24
origin:
  - todos/046-pending-p2-rejected-archive-filter.md
  - todos/050-pending-p2-quiet-rejected-column.md
---

# feat: Archive / filter rejected applications + visual quieting

## Overview

Combine todos #046 and #050 into a single coherent change: reduce the visual noise of closed (accepted + rejected) applications across all views while keeping them one click away. A single **Closed** column replaces the separate accepted/rejected columns in the kanban board, combining all terminal-stage cards with time-based collapsing for older items. When hidden, a persistent toggle shows the closed count and reveals the Closed column inline. When visible, cards in the Closed column are visually quieted so they don't compete with active pipeline stages.

## Principles

- **One global preference.** `showClosed` lives in `App.vue` and is persisted to `localStorage`. It defaults to `true` (visible) and affects all three views simultaneously — toggling to hidden is an opt-in focus mode. Users who clear storage get their history back by default.
- **Don't eliminate the column slot; collapse it to a ghost header.** When closed apps are hidden, the Closed column shrinks to a column-width ghost header labelled "N Closed ›". The column slot stays in the layout; only its contents are hidden.
- **One Closed column, not two.** Accepted and rejected terminal stages render in a single Closed column. Recent items (< 14 days) are always visible within the column; older items collapse behind a "Show N older" toggle. Accepted is typically singular — the job hunt ends at that point.
- **Quiet, not invisible.** When visible, rejected cards/rows/segments use muted foreground text tokens rather than opacity reduction, so text remains contrast-safe. Accepted cards render at full text weight — the search ended in success. Time-based fading applies uniformly to rejected entries — recent ones are slightly more prominent, older ones more subdued.
- **Respect existing patterns.** Use the same `localStorage` pattern as `jobtracker_compact_header`. Extract the terminal-stages list to a shared constant to avoid duplication between `App.vue` and `ApplicationPanel.vue`.

---

## Step 0 — Shared terminalStages constant

**Files:** `client/src/utils/stages.js` (new or update `utils/timeline.js` if it already exports stage lists)

Extract the terminal stages list to a shared constant so `App.vue` and `ApplicationPanel.vue` don't each define `['accepted', 'rejected']` independently:

```js
// client/src/utils/stages.js
export const TERMINAL_STAGES = ['accepted', 'rejected']
export const ACTIVE_STAGES = ['interested', 'applied', 'screening', 'interview', 'offer']
```

Import `TERMINAL_STAGES` wherever the inline literal currently appears.

> **Note:** Check `utils/timeline.js` first — it defines `TERMINAL_STAGES` on line 2 but does **not** currently export it. Add `export` to that line and import from there rather than creating a new file.

---

## Step 1 — Global Filter State in App.vue

**Files:** `client/src/App.vue`

0. Update the vue import to add `computed`:
   ```js
   import { ref, computed, onMounted, watch } from 'vue'
   ```
1. Import the shared constant:
   ```js
   import { TERMINAL_STAGES } from './utils/stages.js'
   ```
2. Add a ref — initialize directly from `localStorage` to avoid a one-tick flash when the user previously set `false`. Do **not** initialize to `true` then override in `onMounted`:
   ```js
   const SHOW_CLOSED_KEY = 'jobtracker_show_closed'
   const _stored = localStorage.getItem(SHOW_CLOSED_KEY)
   const showClosed = ref(_stored === null ? true : _stored === 'true')
   ```
3. ~~Restore from `localStorage` in `onMounted`~~ — handled by direct initialization above. No `onMounted` step needed for `showClosed`.
4. Add a setter:
   ```js
   function toggleShowClosed() {
     showClosed.value = !showClosed.value
     localStorage.setItem(SHOW_CLOSED_KEY, String(showClosed.value))
   }
   ```
5. Compute `displayApplications` (used by TableView and TimelineView):
   ```js
   const displayApplications = computed(() => {
     if (showClosed.value) return applications.value
     return applications.value.filter(a => !TERMINAL_STAGES.includes(a.status))
   })
   ```
6. Compute `closedCount`:
   ```js
   const closedCount = computed(() =>
     applications.value.filter(a => TERMINAL_STAGES.includes(a.status)).length
   )
   ```
7. Close the detail panel when the user hides closed apps while a terminal-stage app is open. App.vue uses `panelApp` (the selected application ref, line 162) and `showPanel` (visibility ref, line 163) — not `selectedApp`:
   ```js
   watch(showClosed, (visible) => {
     if (!visible && panelApp.value && TERMINAL_STAGES.includes(panelApp.value.status)) {
       showPanel.value = false
     }
   })
   ```
8. **Global toggle in the view switcher bar** — add a `<button>` that calls `toggleShowClosed` and is hidden when `closedCount === 0`. Use `v-show` (not `v-if`) to avoid layout shift when the first app closes. Example:
   ```html
   <button
     v-show="closedCount > 0"
     :aria-label="showClosed ? 'Hide closed applications' : `Show ${closedCount} closed applications`"
     :aria-pressed="showClosed"
     @click="toggleShowClosed"
     class="... view switcher toggle styles ..."
   >
     {{ showClosed ? 'Hide closed' : `${closedCount} closed` }}
   </button>
   ```

9. **Pass to views:**
   - `<KanbanBoard>` receives the **full unfiltered `applications`** (so its internal watcher always has complete data for all 7 stage buckets). It filters internally via `showClosed`.
   - `<TableView>` and `<TimelineView>` receive `displayApplications`.
   - All three views receive `showClosed`, `closedCount`, and `@toggle-show-closed="toggleShowClosed"`.

   ```html
   <KanbanBoard
     :applications="applications"
     :showClosed="showClosed"
     :closedCount="closedCount"
     @toggle-show-closed="toggleShowClosed"
     @status-change="onStatusChange"
     @select="openPanel"
   />
   <TableView
     :applications="displayApplications"
     :showClosed="showClosed"
     :closedCount="closedCount"
     @toggle-show-closed="toggleShowClosed"
   />
   <TimelineView
     :applications="displayApplications"
     :showClosed="showClosed"
     :closedCount="closedCount"
     @toggle-show-closed="toggleShowClosed"
   />
   ```

---

## Step 2 — KanbanBoard: Single Collapsible Closed Column

**Files:** `client/src/components/KanbanBoard.vue`, `client/src/components/KanbanCard.vue`

### Props

```js
const props = defineProps({
  applications: Array,  // always the full unfiltered list
  showClosed: Boolean,
  closedCount: Number,
  showUser: Boolean,    // retain existing prop
})
const emit = defineEmits(['status-change', 'select', 'toggle-show-closed'])
```

### Closed column architecture

Replace the two separate `accepted` and `rejected` columns with a single **Closed** column. All terminal-stage cards land here. The column contains two sub-sections:

- **Recent** (< 14 days since status change): always visible when the column is open. Use `rejected_at` for rejected apps and `accepted_at` for accepted apps to determine age; fall back to `updated_at` if the specific field is null.
- **Older** (≥ 14 days): collapsed by default behind a "Show N older" inline toggle within the column. This toggle's state is **ephemeral** — resets to collapsed on every page load. Do not persist it to `localStorage`.

The column's internal stage buckets (`columns.accepted`, `columns.rejected`) continue to be populated by the existing `watch` — only the template changes to unify them into one column element.

### Desktop layout changes

Column count changes from 7 to 6: 5 active stages + 1 Closed column.

**When `showClosed` is false and `closedCount > 0`:**
- Replace the Closed column with a **ghost column header** — same width as a regular column, matching other column headers in height. Label: `"N Closed ›"` (show direction).

**When `showClosed` is true (full column visible):**
- The Closed column header should also be a `<button>` (or include a hide control) allowing the user to collapse it back. Label: `"‹ Hide Closed"` or a close icon. Without this, the only way to hide is via the global toggle in the view switcher bar. Decide which approach to use and implement consistently — either a column-level hide control or rely solely on the global toggle.
- The column's draggable lists are rendered with `v-show="false"` (not `v-if`) so vuedraggable drop targets remain active. Dragging a card to the visually hidden column still works; the card will disappear from the active view after the status refresh.
- The ghost header is a `<button>` element:
  ```html
  <button
    :aria-label="`Show ${closedCount} closed applications`"
    :aria-pressed="false"
    @click="$emit('toggle-show-closed')"
    class="... ghost column header styles ..."
  >
    <span aria-live="polite">{{ closedCount }}</span> Closed ›
  </button>
  ```
- Clicking emits `toggle-show-closed`. The `aria-live="polite"` span announces count changes to screen readers when a card is dragged into the hidden column.

**When `showClosed` is true:**
- Render the full Closed column with its recent / older sub-sections visible.

### Mobile layout changes

The mobile swipeable layout has "Active" and "Closed" groups.

**When `showClosed` is false and `closedCount > 0`:**
- Render only the "Active" swipeable group.
- Add a sticky banner as a **sibling element above the snap container** (not inside it), so `position: sticky` works correctly without fighting the horizontal scroll context:
  ```html
  <div class="flex flex-col">
    <!-- sticky banner — sibling of the snap container -->
    <button
      v-show="!showClosed && closedCount > 0"
      :aria-label="`Show ${closedCount} closed applications`"
      @click="$emit('toggle-show-closed')"
      class="sticky top-0 z-10 w-full min-h-[44px] ..."
    >
      {{ closedCount }} closed
    </button>

    <!-- snap container -->
    <div class="flex overflow-x-auto snap-x ...">
      ...
    </div>
  </div>
  ```
- After the toggle fires and `showClosed` becomes true, use a `nextTick` + `scrollTo` to scroll the snap container to the Closed group. Add `nextTick` and `ref` to the Vue import line, and declare `const closedGroupRef = ref(null)` bound to the Closed group element via `ref="closedGroupRef"`:
  ```js
  // Vue import — update existing line:
  import { reactive, watch, nextTick, ref } from 'vue'

  const closedGroupRef = ref(null)  // bind to Closed group element

  async function handleToggle() {
    emit('toggle-show-closed')
    await nextTick()
    closedGroupRef.value?.scrollIntoView({ behavior: 'smooth' })
  }
  ```

**When `showClosed` is true:**
- Render both swipeable groups as before.

### Global toggle — view switcher bar

The `showClosed` toggle in the App.vue view switcher bar serves as the canonical global control for TableView and TimelineView. The KanbanBoard ghost header is the spatial exception for kanban layout. TableView and TimelineView do **not** add per-view chips; they rely on the global control only (and the empty-state fallback described in Steps 3–4).

### KanbanCard visual quieting

Add a `quiet` prop to `KanbanCard.vue`:

```js
const props = defineProps({
  application: Object, // keep existing prop name
  quiet: Boolean,
})
```

When `quiet` is true, use **muted foreground text tokens** rather than opacity reduction (preserving contrast in both themes):

- Company name: `text-ink-3` (muted) instead of `text-ink`.
- Role and meta text: existing muted token, one level further subdued.
- Card background: unchanged — opacity must remain at a level that keeps the card surface and text contrast WCAG AA compliant.
- On hover, restore full text colour: `hover:text-ink transition-colors duration-200`.

Do not apply `opacity-50` to the whole card. Use colour-token-based quieting only.

In `KanbanBoard.vue`, pass `:quiet="app.status === 'rejected'"` to KanbanCards in the Closed column — only rejected cards are quieted. Accepted cards render at full text weight. The toggle bar label reads `props.closedCount` (the prop from App.vue, which counts from the full unfiltered list).

---

## Step 3 — TableView: Row Filtering + Visual Quieting

**Files:** `client/src/components/TableView.vue`

### Props

```js
import { TERMINAL_STAGES } from '../utils/stages.js'  // or timeline.js after Step 0

defineProps({
  applications: Array,   // receives displayApplications (pre-filtered)
  showClosed: Boolean,
  closedCount: Number,
})
defineEmits(['toggle-show-closed'])
```

### Layout changes

TableView receives `displayApplications` — row filtering is handled upstream. No per-view toggle chip. The global control in the view switcher bar handles show/hide.

**Empty state:** When `applications.length === 0` and `closedCount > 0`, show a contextual message instead of "No applications yet":

```html
<tr v-if="applications.length === 0">
  <td colspan="..." class="...">
    <template v-if="closedCount > 0">
      All your applications are closed —
      <button @click="$emit('toggle-show-closed')" class="underline">
        show {{ closedCount }} closed
      </button>
    </template>
    <template v-else>
      No applications yet. Click "+ Add Application" to get started.
    </template>
  </td>
</tr>
```

**Row quieting:** Rejected rows render with muted foreground text (`text-ink-3`). Accepted rows render at full text weight — do not quiet them. Use `TERMINAL_STAGES.includes(app.status) && app.status !== 'accepted'` (or simply `app.status === 'rejected'`) to gate the muted class. Do not use `opacity-75` or any opacity reduction, as that breaks WCAG AA contrast.

---

## Step 4 — TimelineView: Segment Filtering + Visual Quieting

**Files:** `client/src/components/TimelineView.vue`

### Props

```js
import { TERMINAL_STAGES } from '../utils/stages.js'  // or timeline.js after Step 0

defineProps({
  applications: Array,   // receives displayApplications
  showClosed: Boolean,
  closedCount: Number,
})
defineEmits(['open-detail', 'toggle-show-closed'])
```

### Layout changes

No per-view toggle chip or persistent section header control. TimelineView receives `displayApplications` — filtering handled upstream. Users control visibility via the global view-switcher toggle; the empty-state button provides a contextual shortcut when the filtered list is empty.

**Empty state:** Same dual-state pattern as TableView — when the filtered list is empty but `closedCount > 0`, show "All your applications are closed — show N closed" with an inline toggle button.

**Visual quieting:** When `showClosed` is true, rejected timeline segments render with muted styling — use a muted colour token on the timeline segment/line for rejected entries, consistent with the kanban card treatment — do not use opacity reduction. Accepted timeline segments render at full weight (positive outcome, typically the final event).

---

## Step 5 — Visual Polish and Edge Cases

1. **Zero closed apps:** When `closedCount === 0`, don't render the ghost header or mobile banner. The global toggle in the view switcher bar uses `v-show="closedCount > 0"` (not `v-if`) so it stays mounted and avoids layout shift when the first app closes.

2. **Admin `all=true` mode:** The filter works — admins see all users' applications, and `displayApplications` filters the already-fetched list. `closedCount` reflects all fetched apps across users. This is expected behaviour.

3. **Status change into a terminal stage:** When a card is dragged to the Closed column (or its hidden drop target) while `showClosed` is false, the card disappears from the active view after the status refresh — the column is rendered with `v-show="false"`, so the drag succeeds but the card is no longer in `displayApplications`.

   **Drag-to-hidden status:** The Closed column spans two stages. When a card is dragged into it, assign `rejected` as the default status (the drag is a close/archive action — if the user meant `accepted`, they'd have used a menu action). Record this decision in KanbanBoard's drag-handler so it is explicit and reviewable.

   **Ghost header pulse:** After the status refresh, pulse-animate the ghost header count badge (e.g., a 1.5s `ring-accent` pulse via a CSS animation class) to confirm the card moved there rather than disappeared. This feedback is **required**, not optional.

   - **Trigger:** App.vue's `onStatusChange` handler detects the new status is terminal and `showClosed` is false. It sets a short-lived `pulseGhost` ref (e.g., `ref(false)`), toggled `true` for 1500ms via `setTimeout`. Pass `:pulseGhost` as a prop to `KanbanBoard`, which binds it to the ghost header's animation class.
   - **Reset:** `pulseGhost` resets to `false` after the timeout — no manual cleanup needed.
   - **ARIA:** The ghost header count element should carry `aria-live="polite"` so screen readers announce the count change when a card moves there. The live region only needs to wrap the count text, not the whole button.
   - **Reduced motion:** Gate the pulse animation class on `!prefers-reduced-motion` (via a CSS media query or `window.matchMedia`). The `aria-live` announcement still fires regardless of reduced-motion preference.

   For the `accepted` case, the same `rejected` default applies — the celebration animation is deferred to a follow-up PR (see Scope Boundaries).

4. **`panelApp` coherence:** The watcher added in Step 1 item 7 clears the detail panel when the user hides closed apps while a terminal-stage app is open (`showPanel.value = false`). No stale panel state.

5. **Contrast and dark mode:** All quieting uses text colour tokens, not opacity on the card root. Both themes must pass WCAG AA contrast for quieted text. `text-ink-3` and equivalent dark-mode tokens are the implementation targets.

6. **Reduced motion:** Honour `prefers-reduced-motion` for the ghost header pulse and accepted celebration. The `transition-colors duration-200` on hover is safe; suppress the pulse animation when `prefers-reduced-motion: reduce` is set.

---

## Step 6 — Testing

1. **Manual dev test checklist:**
   - [ ] Create 1+ rejected and 1+ accepted applications.
   - [ ] Kanban (desktop): Closed column visible by default; toggle to hide — verify it collapses to ghost header with count; click reveals column; closed cards are quieted (muted text, not opacity).
   - [ ] Kanban (desktop): Drag card to Closed column while hidden — card disappears from active view; ghost header pulses to confirm.
   - [ ] Kanban (desktop): Drag an offer-stage card to Closed — confirm it moves to rejected (not accepted), and that the ghost header pulses if showClosed=false.
   - [ ] Kanban (desktop): Older items (≥ 14 days) are collapsed within the Closed column; "Show N older" toggle works.
   - [ ] Kanban (mobile): Sticky banner shows closed count when hidden; tap reveals Closed group and auto-scrolls to it.
   - [ ] Table: `showClosed=false` with only closed apps → empty state shows contextual message with toggle, not "No applications yet".
   - [ ] Table: Rejected rows are visually quieted (muted text).
   - [ ] Timeline: Same empty state and quieting behaviour.
   - [ ] Refresh page: preference persists (default true for new users / cleared storage).
   - [ ] No closed apps: ghost header, mobile banner, and view switcher toggle all hidden.
   - [ ] Admin `all=true`: filter still works correctly; closedCount reflects all users.
   - [ ] Selecting a closed app then toggling to hide → detail panel closes cleanly.
   - [ ] Keyboard: ghost header, mobile banner, and any toggle are reachable by Tab and activate on Enter/Space.
   - [ ] Screen reader: toggle buttons announce current state ("Show N closed applications" / "Hide closed applications").

2. **Smoke-test the API** (there are no automated backend tests):
   ```bash
   curl -s http://localhost:3000/api/applications \
     -H 'X-Forwarded-Email: dev@localhost' | jq
   ```

---

## Scope Boundaries

- **Out of scope:** Separate accepted/rejected visual treatment beyond text weight — accepted renders at full weight, rejected is quieted (muted tokens) across all three views.
- **Out of scope:** Per-view filter persistence (global only).
- **Out of scope:** Server-side filtering (client-side only; the full list is already in memory).
- **Out of scope:** Settings panel toggle (global control lives in the view switcher bar only).
- **Out of scope:** Stale applications in non-terminal stages (e.g., `interested` rows with no activity for 60+ days). This is a distinct noise problem; a separate decay/stale-indicator feature should address it.
- **Future work:** Accepted celebration animation — specify and implement via the `animate` or `delight` skill in a follow-up PR.

## Files to Modify

| File | Changes |
|------|---------|
| `client/src/utils/stages.js` | Create (or update `utils/timeline.js`): export `TERMINAL_STAGES`, `ACTIVE_STAGES` |
| `client/src/App.vue` | Add `showClosed` ref (default true), localStorage, `displayApplications` computed, `closedCount`, `panelApp`/`showPanel` watcher, global toggle button, template event wiring |
| `client/src/components/KanbanBoard.vue` | Single Closed column, ghost header, v-show drop targets, mobile sticky banner + scrollTo, pass `quiet` to cards |
| `client/src/components/KanbanCard.vue` | Add `quiet` prop, muted text token styles (no opacity-50), `transition-colors duration-200` on hover |
| `client/src/components/TableView.vue` | Pre-filtered prop, dual empty state, rejected row quieting |
| `client/src/components/TimelineView.vue` | Pre-filtered prop, dual empty state, rejected segment quieting |

## Post-Implementation

- Move `todos/046-pending-p2-rejected-archive-filter.md` and `todos/050-pending-p2-quiet-rejected-column.md` to `todos/complete/`.

## Deferred / Open Questions

### From 2026-04-24 review

- **Mobile closed indicator underspecified** — Step 2 — KanbanBoard: Mobile layout changes (P1, design-lens, confidence 75)

  The plan describes the mobile control as "a small floating pill or bottom indicator" — two meaningfully different patterns. A floating element can obscure card content during swipe; a bottom indicator competes with system navigation. Neither position, minimum tap-target size, nor z-index behaviour is resolved, leaving implementation guesswork that risks a poor mobile experience.

  <!-- dedup-key: section="step 2  kanbanboard mobile layout changes" title="mobile closed indicator underspecified" evidence="Plan text: 'Add a small floating pill or bottom indicator showing \"N closed\" that toggles' — 'or' left unresolved" -->

### From 2026-04-25 review (Round 2)

- **Accepted celebration: implement now or truly defer?** — Scope Boundaries + Step 2 + Step 6 (P0, coherence + scope-guardian, confidence 90)

  Scope Boundaries marks the accepted celebration as Future Work. Step 2 has a full "Accepted celebration" subsection describing the behavior (emit `accepted` event, App.vue triggers animation). Step 6 includes a checklist item testing it. The feature is simultaneously deferred and required. Decide: implement it in this PR (remove from Future Work, keep Step 2 subsection + Step 6 checklist item), or truly defer it (remove the Step 2 subsection and Step 6 checklist item, keep only the Future Work note).

  <!-- dedup-key: section="scope boundaries + step 2 + step 6" title="accepted celebration: implement now or truly defer?" evidence="Scope Boundaries: 'Future work: Accepted celebration animation' — Step 2 describes full implementation — Step 6 tests it" -->

- **TimelineView `toggle-show-closed` emit vs no toggle UI** — Step 4 defineEmits (P1, coherence, confidence 75)

  Step 4 adds `defineEmits(['open-detail', 'toggle-show-closed'])` and the empty-state button fires the emit. But there is no described toggle UI within the TimelineView itself — the global view-switcher control is the only toggle, and the empty-state button is the only in-view trigger. Confirm: is the empty-state button the sole in-view trigger for this emit, or should TimelineView have a persistent toggle control somewhere (e.g., in its section header)?

  <!-- dedup-key: section="step 4 defineemits" title="timelineview toggle-show-closed emit vs no toggle ui" evidence="Step 4 defineEmits(['open-detail', 'toggle-show-closed']) — no toggle UI described in TimelineView beyond empty-state button" -->

- **Accepted vs rejected: uniform quieting or positive differentiation?** — Step 2 / Scope Boundaries (P1, product-lens, confidence 70)

  The plan quiets all closed cards uniformly — accepted and rejected both use muted tokens. Scope Boundaries reinforces this: "both are quieted uniformly." However, Step 4 carves out an exception for TimelineView ("Accepted timeline segments render at full weight"). The accepted state is a victory, not just another closed stage. Consider whether KanbanBoard and TableView should also give accepted apps a visual distinction (e.g., full-weight text, a subtle accent, or no quieting at all), rather than treating the best outcome identically to rejection.

  <!-- dedup-key: section="step 2  scope boundaries" title="accepted vs rejected: uniform quieting or positive differentiation?" evidence="Scope Boundaries: 'both are quieted uniformly' — Step 4: 'Accepted timeline segments render at full weight'" -->

- **Sticky banner z-position relative to snap container** — Step 2 mobile layout (P2, design-lens, confidence 70)

  The mobile sticky banner is described as "above the swipe area (not floating over content)" but the snap container in KanbanBoard likely uses `overflow-x: scroll` (or `overflow-x: auto`) on the parent. `position: sticky` only works relative to the nearest scrolling ancestor. If the sticky banner is a sibling of the snap container it works as intended; if it is inside the snap container it will scroll with the content. The CSS class approach and the containing element relationship need to be specified to avoid a layout bug on mobile.

  <!-- dedup-key: section="step 2  mobile layout changes" title="sticky banner z-position relative to snap container" evidence="Step 2: 'sticky banner above the swipe area (not floating over content)' — snap container scroll context unspecified" -->
