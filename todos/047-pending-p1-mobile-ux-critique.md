---
status: open
priority: p1
issue_id: "047"
tags: [design, mobile, ux, accessibility]
dependencies: []
---

# Mobile UX — Critique Follow-up

## Source

`/impeccable:critique` run 2026-04-22. Scored 30/40 on Nielsen's heuristics.
Design is intentional and non-AI-slop. Top problem cluster identified: **mobile friction**.

## Problem Summary

The stated primary use case is "checks daily, often from phone" but three issues
make the mobile experience significantly worse than desktop:

1. **ApplicationPanel is too dense on mobile** — edit mode stacks status bar, 5+
   primary fields, 3×3 dates grid, journey bar, attachments section, and notes
   section vertically in a 92vh bottom sheet. Notes (most frequent interaction) are
   buried below salary fields and date grids. A daily check-in requires excessive
   scrolling.

2. **Kanban shows 7 columns at 85vw each on mobile** — the snap-scroll pattern
   forces 7 swipes to see the full pipeline. "Scan at a glance" is impossible.
   Table view is a workaround, but users have to manually switch.

3. **No feedback when actions save; all errors are alert() dialogs** — silent
   success looks identical to silent failure. Browser alert() freezes the UI,
   can't be styled, and breaks the visual flow. On mobile this is worse: alert()
   dialogs interrupt gesture flow and can't be dismissed without a tap.

## Recommended Actions (in order)

- [x] **`/shape`** (P1) — Restructure ApplicationPanel edit-mode for mobile and
  desktop: reorder sections so Status + Notes appear first (before salary/URL
  fields and dates); add collapsible disclosure panels for Dates / Journey /
  Attachments so daily check-in is 1–2 scrolls, not 6. Create-mode is already
  lighter — this is edit mode specifically.
  **Plan:**
  1. Reorder edit-mode sections: Header → Status bar → Notes → Primary fields → Dates → Journey → Attachments
  2. Wrap Dates, Journey (timeline), and Attachments in collapsible `<details>`/`<summary>` disclosure panels (closed by default)
  3. Keep create mode unchanged
  4. No API changes — purely presentational

- [ ] **`/adapt`** (P1) — Fix Kanban on mobile. 7-column 85vw snap-scroll breaks
  the "scan at a glance" use case. Explore: 2-column collapsed view (Active + Closed),
  denser compact card mode that fits 4 columns, or auto-switching to Table on
  `window.innerWidth < 600` (768 already defaults to Table on first load but
  users can switch back). Preserve drag-and-drop on touch if possible.

- [x] **`/delight`** (P1) — Replace all `alert()` / `confirm()` calls with a toast
  notification system. Toast delivers: success feedback ("Moved to Interview"),
  error recovery ("Couldn't save — check your connection · Retry"), and undo for
  status changes ("Moved to Rejected · Undo" with 4s window). The undo pattern
  eliminates the accidental-drag problem on touch without a confirmation dialog.

## Acceptance Criteria

- [x] Tapping a Kanban card, changing status, and adding a note takes ≤ 3 taps
  and ≤ 2 scrolls on a 390px-wide phone
- [ ] Full pipeline is visible (or navigable in ≤ 2 swipes) on mobile Kanban
- [x] All `alert()` and `confirm()` calls replaced with toasts / inline confirmations
- [x] Status changes show a toast with an undo action; undo successfully reverts
- [x] Note deletion requires confirmation (currently instant; all other destructive
  actions confirm)

## Minor Observations (from critique — address if time permits)

- No stage colour legend in Timeline view (board is self-labelling; timeline bars are not)
- `bg-black/40` backdrop overlays flagged by detector — `bg-ink/70` would tint with the theme
- Markdown support in notes invisible — placeholder mentions it but there's no rendered preview hint
- Salary min/max has no validation (min can exceed max)
- `✓ Copied` in SettingsPanel uses Unicode character; small SVG tick would be consistent

## Work Log

- 2026-04-22: Created from `/impeccable:critique` findings; 30/40 heuristic score;
  user chose Mobile UX cluster, top 3 issues only
- 2026-04-23: Completed `/delight` task (toast system + inline confirmations). See
  learnings below.
- 2026-04-23: Scoped `/shape` task — both mobile and desktop, `/shape` before `/adapt`.
- 2026-04-23: Completed `/shape` — Notes moved above primary fields in edit mode;
  Dates, Journey, and Attachments wrapped in collapsible `<details>` panels with
  chevron rotation; Safari marker hidden; client build and server tests pass.
- 2026-04-23: Verified `/shape` implementation against acceptance criteria. Edit-mode
  section order is Header → Status → Notes → Primary fields → Dates → Journey →
  Attachments. Notes are immediately accessible without scrolling. Dates, Journey,
  and Attachments are collapsible `<details>` panels closed by default. Create mode
  unchanged. No API changes. Client build and server tests pass (51/51).

## Learnings (from /delight implementation)

**Architecture — module-level singleton for toasts works well in Vue 3.**
`useToast.js` exports a shared `toasts` ref at module scope. Any component can
import and push/dismiss without `provide/inject` or Pinia. No gotchas at scale
because toasts are ephemeral, not shared domain state.

**Undo needs to cover both status-change paths.**
ApplicationPanel's status bar and KanbanBoard's drag-and-drop both call
`updateStatus`, but via different code paths. Undo was wired to both:
Kanban drag via `App.vue handleStatusChange` (has access to `loadApplications` and
`panelApp`); panel status bar via `onStatusClick` directly. Centralising into one
path would be cleaner but required a larger refactor — noted as future tech debt.

**Snapshot `appId` in undo closures, not `props.panelApp`.**
The undo toast lives in a module-level store that outlives the panel. If the user
closes the panel during the 4s undo window, `props.panelApp` is null. Capturing
`const appId = props.panelApp?.id` at call time prevents the closure from
throwing.

**Inline confirmations beat dialogs for two-step destructive actions.**
`pendingDelete` and `pendingClose` refs transform the sticky footer into a
confirmation bar in place — no modal, no layer, no focus trap complexity. The
pattern is: first click arms the ref, footer re-renders, second click (or Cancel)
resolves it. This is faster to implement and more in keeping with the "no modals"
design principle.

**Cap toast count to avoid error-burst pile-up.**
Without a cap, a broken network connection triggering repeated saves would stack
indefinitely. Enforced at 5; oldest toast is evicted when the limit is hit.
