---
status: open
priority: p2
issue_id: "056"
tags: [ux, application-panel, cognitive-load, status]
dependencies: []
---

# Design Brief: Reduce Cognitive Load from Seven Status Pills

> This brief was produced by the `shape` skill. It replaces the original todo body with a structured artifact that guides implementation through discovery, not guesswork. **Do not write code until the open questions are resolved.**

---

## 1. Feature Summary

A refined status selector for the application panel that reduces cognitive load by creating clear visual hierarchy between the active pipeline stage and inactive alternatives. The current seven equally-weighted pills force users to scan all options every time they change status; this redesign makes the active stage immediately scannable and dominant while keeping all alternatives accessible with a single tap.

---

## 2. Primary User Action

**Instantly recognize the current stage and confidently change it with minimal eye movement and zero hesitation.**

The user should never have to "read" the inactive pills. They should register as background texture; only the active stage and the one the user intends to tap should enter consciousness.

---

## 3. Design Direction

**Tactical and decisive.** The status bar should feel like a campaign control panel, not a multiple-choice question. The active stage needs to read as *set*, not just *highlighted*. Inactive stages should recede so thoroughly that the user perceives them as available options rather than competing choices.

This expresses the project's **"tactical, forward, sharp"** personality by treating status changes as progress markers, not form fields. The active pill should feel like a stamp of current reality — present, grounded, authoritative. The inactive pills should feel like potential energy waiting to be activated.

The existing `stage-stamp` animation already captures this emotional beat. The redesign should *amplify* it by making the "before" state quieter so the "after" state hits harder.

**Anti-references:** Segmented controls (too balanced), dropdown selects (hide information), Material Design chips (too bubbly), iOS-style pills (too generic).

---

## 4. Layout Strategy

### Desktop (480px drawer)
Horizontal row of 7 pills inside a sticky status bar. The active pill is physically larger (more vertical padding, maintained `min-h-[44px]`) and sits at full opacity with a `ring-2` outline. Inactive pills are visually smaller (reduced vertical padding to create size contrast, still 44px touch target) at lowered opacity with no ring.

This creates a **figure/ground relationship**: the active pill is the figure; the row is the ground. The gap between pills remains tight (`gap-1.5`) because they are a single control group, not independent buttons.

### Mobile (bottom sheet)
Same horizontal scroll row, but terminal stages (`accepted`, `rejected`) are collapsed into a single **"Closed ▾"** pill that expands to show both options when tapped. This reduces the default visible count from 7 to 6, which is meaningful on narrow screens where horizontal scroll feels clunky. The active stage is **never** hidden inside the collapsed group — if the current status is `accepted` or `rejected`, that pill appears directly and the collapsed group is not shown.

### Spatial rhythm
The status bar is a sticky element at the top of the scrollable panel body. It should feel like a toolbar: compact, purposeful, not spacious. On desktop it sits below the company-name header; on mobile it sits immediately below the drag handle. No extra vertical padding around the bar itself — the `py-2` in the container and the pill sizing should do all the work.

---

## 5. Key States

### Default (active stage selected)
- **Active pill**: full opacity (`opacity-100`), `ring-2 ring-offset-1`, slightly taller/larger presence, `stage-stamp` animation if recently changed
- **Inactive pills**: `opacity-30`, no ring, slightly reduced vertical padding (but still `min-h-[44px]`)
- **User feels**: "I know exactly where this application stands"

### Hover (inactive pill, desktop)
- **Inactive pill**: `opacity-60` on hover
- **Active pill**: unchanged
- **Transition**: `transition-all` with `duration-200`
- **User feels**: "I can change this if I need to"

### Focus (keyboard navigation)
- **Focused pill**: custom focus ring (2px accent) that sits outside the active-state ring
- **`aria-pressed="true"`** on active stage only; `"false"` on all others
- **User feels**: predictable, orderly keyboard control

### Collapsed (mobile, terminal stages not active)
- **"Closed ▾"** pill appears in the row with the same inactive styling (`opacity-30`, no ring)
- Chevron indicates expandability
- Tapping expands the group
- **User feels**: options are available but not in the way

### Expanded (mobile, terminal stages)
- **"Closed ▴"** pill opens inline or as a small popover to reveal `accepted` + `rejected` as sub-pills
- Sub-pills use the same inactive styling as other stages
- Tapping a sub-pill changes status and auto-collapses the group
- Tapping "Closed ▴" again collapses without changing status
- **User feels**: quick access without permanent clutter

### Collapsed with terminal stage active
- If current status is `accepted` or `rejected`, that pill appears directly in the row
- The "Closed" collapsed group is hidden entirely
- **User feels**: the current reality is visible; other terminal option is one tap away via the remaining pill

### Loading / Saving
- Status changes are **optimistic**: UI updates immediately
- `stage-stamp` animation provides primary feedback
- No spinner, no disabled state
- **User feels**: instantaneous

### Error (API failure)
- Status reverts to previous value with a smooth transition
- Toast error appears below
- No inline error state in the status bar itself
- **User feels**: system is honest about failures

---

## 6. Interaction Model

### Status change flow
1. User taps an inactive pill
2. Active pill immediately drops to inactive styling (opacity fades, ring disappears)
3. New active pill receives ring + full opacity
4. `stage-stamp` animation fires on the new pill (380ms `ease-out-quart`)
5. API call fires in background
6. Toast confirms: "Moved to [Stage]" with Undo action

### Mobile terminal group flow
1. **Default**: "Closed ▾" visible alongside 5 other stage pills (`interested` → `offer`)
2. **Tap "Closed ▾"**: expands to reveal `accepted` + `rejected`
3. **Tap a terminal stage**: status changes, group auto-collapses, selected stage now appears directly in the row
4. **Tap "Closed ▴" or outside**: collapses without changing status

### Keyboard navigation
- Tab cycles through all focusable pills
- If terminal group is collapsed, it is a single tab stop
- If expanded, `accepted` and `rejected` are individual tab stops
- Enter/Space selects a pill
- `aria-pressed` communicates selected state

---

## 7. Content Requirements

| Content | Source | Notes |
|---------|--------|-------|
| `interested`, `applied`, `screening`, `interview`, `offer`, `accepted`, `rejected` | Existing | Capitalized via CSS `capitalize`; no changes |
| "Closed" | New | UI container label for collapsed terminal group. Should match stage label casing (lowercase in source, capitalized via CSS) |
| Chevron (`▾` / `▴`) | New | Indicates expand/collapse state. Use existing SVG chevron pattern from `details/summary` components |
| `aria-pressed` | Existing | `"true"` on active, `"false"` on inactive |
| `aria-expanded` | New | On the "Closed" toggle when terminal group is present |

---

## 8. Recommended References

| File | Why |
|------|-----|
| `reference/interaction-design.md` | Focus handling, progressive disclosure patterns, button hierarchy |
| `reference/motion-design.md` | Refining `stage-stamp` timing; adding subtle opacity/size transitions |
| `reference/responsive-design.md` | Mobile collapsed-group behavior, container vs viewport queries |
| `reference/ux-writing.md` | If the "Closed" label needs refinement |

---

## 9. Open Questions

**Must resolve before implementation:**

1. **Collapsed group interaction model**: Should the mobile terminal group expand **inline** (pushing the row taller) or as a **small popover/dropdown** below the pill? Inline is simpler and avoids positioning logic; a popover is cleaner but requires absolute positioning and collision detection.

2. **Inactive opacity value**: The todo suggests `opacity-40`; this brief recommends `opacity-30` for stronger figure/ground separation. Verify `opacity-30` is not too faint in dark mode (where contrast perception differs). Test both light and dark before finalizing.

3. **Size reduction approach**: Should inactive pills be reduced in **height** (less vertical padding while keeping `min-h-[44px]`) or in **width** (less horizontal padding)? This brief recommends height reduction so text remains fully readable; confirm this aligns with the design intent.

4. **Compact mode (icon + dot)**: The todo lists this as "optional." Is it in scope for this issue, or deferred? If included: should it activate at a specific container width, and what visual should represent each stage (color dot + first letter, or distinct icons)?

5. **Stage iconography**: If compact mode proceeds, the product currently has no stage icons. Is designing 7 minimal glyphs in scope, or should we use the stage color dot + first letter approach (e.g., "I", "A", "S")?

---

## Appendix: Current Implementation Snapshot

```vue
<!-- ApplicationPanel.vue lines 62-78 -->
<div class="px-5 py-2 border-b border-line shrink-0 overflow-x-auto scrollbar-none">
  <div class="flex gap-1.5 min-w-max">
    <button
      v-for="s in statuses"
      :key="s"
      @click="onStatusClick(s)"
      :aria-pressed="form.status === s"
      :class="[
        form.status === s ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-50 hover:opacity-80',
        stampingStatus === s ? 'stage-stamp' : ''
      ]"
      :style="statusPillStyle(s)"
      class="px-2.5 py-1.5 min-h-[44px] inline-flex items-center rounded-full text-xs font-medium capitalize transition-all"
    >{{ s }}</button>
  </div>
</div>
```

**Preserved behaviors:**
- `aria-pressed` accessibility
- `stage-stamp` animation (380ms ease-out-quart)
- `min-h-[44px]` touch target
- Stage color tokens (`--stage-*-bg`, `--stage-*-fg`)
- Optimistic update with toast + undo
