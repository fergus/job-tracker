---
status: complete
priority: p1
issue_id: "071"
tags: [design, ux, critique, timeline, accessibility]
dependencies: []
---

# P1 — Timeline View Design Critique

**Critique date:** 2026-04-30  
**Critique score:** 28/40 (Good band)  
**Cognitive load:** 4 failures (critical)  
**Scope:** All 5 priority issues + polish pass  
**Design direction:** Bolder, more editorial, emotionally resonant

---

## Overview

The Timeline View fails its own stated purpose: "spot patterns across your search." It is a passive data dump with no pattern-seeking affordances, no legend, no summary, and no sorting. The emotional tone is neutral-to-sterile, contradicting the brand promise of "tactical, forward, sharp" and "mission board meets editorial spread."

---

## Issue 1: [P0] Hover-gated stage identification

**What:** Users must hover precisely over a 24px-high bar segment to learn which stage it represents. No legend, no persistent labels, no mobile fallback.

**Why it matters:** Primary insight mechanism is completely hidden. Violates "Recognition Rather Than Recall." On mobile (no hover), the view is uninterpretable.

### Sub-tasks

- [x] Add a fixed stage legend above the timeline axis
  - Color dot + stage name for each of the 5 active stages + accepted + rejected
  - Use existing CSS stage variables (`--stage-interested`, etc.)
  - Position it between the view switcher and the timeline header row
  - Collapse gracefully on narrow viewports (wrap or horizontal scroll)

- [x] Render stage labels inside bar segments
  - Show full stage name (truncated) inside segments wider than ~80px
  - Show 1-2 character initials inside segments 40–80px wide
  - Hide text inside segments narrower than 40px (rely on legend + hover)
  - Text color: auto-contrast against segment background (light on dark, dark on light)

- [x] Make tooltips work on touch devices
  - Convert hover tooltips to click/long-press on touch
  - Or replace with an inline detail row that expands on click

### Acceptance criteria

- [x] A first-time user can identify every visible segment's stage without hovering
- [x] The legend is visible on first paint (no interaction required)
- [x] On a touch device (or with hover disabled), every segment's stage is still discoverable
- [x] Text inside segments remains legible in both light and dark mode
- [x] No layout shift when segment labels appear/disappear on resize

---

## Issue 2: [P1] Right-aligned company names in unreadably small type

**What:** Company names are `text-xs`, right-aligned, default weight. TableView uses `font-condensed font-semibold text-sm`. The ragged left edge creates visual noise.

**Why it matters:** Right-aligned text is harder to scan. `text-xs` is too small for primary identifiers. Inconsistency with TableView undermines design system trust.

### Sub-tasks

- [x] Change label column alignment from right to left
  - Update `pr-3 text-right` to `pl-3 text-left` (or equivalent)
  - Maintain the `w-24 sm:w-36 md:w-[200px]` responsive widths

- [x] Upgrade company name typography
  - Change from `text-xs font-medium` to `text-sm font-condensed font-semibold`
  - Keep `truncate` to prevent overflow
  - Keep `text-ink-2` (or `text-ink` for active, `text-ink-3` for quieted)

- [x] Keep role title understated
  - Remain at `text-xs` to create typographic contrast with company name
  - Keep `text-ink-3` (or `opacity-60` for quieted)

- [x] Add left padding between label column and bar area
  - Prevent labels from visually crowding the bars
  - At least `gap-3` or `ml-2` equivalent

### Acceptance criteria

- [x] Company names are left-aligned and scannable at a glance
- [x] Company name uses `font-condensed font-semibold text-sm`
- [x] Role title is visually subordinate to company name (smaller, lighter weight)
- [x] Label column and bar area have clear separation (no touching)
- [x] Visual treatment matches or exceeds TableView's treatment of the same data
- [x] Both light and dark mode remain legible

---

## Issue 3: [P1] Flat list with no grouping or summary

**What:** Applications are one undifferentiated vertical stack. No sectioning, no summary, no pattern recognition affordances.

**Why it matters:** At 30+ applications, this becomes an unscrollable wall. The user must be their own data analyst. The app misses its core value proposition.

### Sub-tasks

- [x] Group applications by current status
  - Use section headers: "Interview (3)", "Applied (7)", "Offer (1)"
  - Style headers distinctly (e.g., `text-xs font-bold uppercase tracking-wider text-ink-3`)
  - Add a subtle horizontal rule or background tint between groups
  - Sort groups by pipeline order: Interview → Screening → Applied → Interested → Offer → Accepted → Rejected (or similar logical order)

- [x] Add a summary band at the top of the timeline
  - Average days per stage across all visible applications
  - Count of applications stalled >30 days in current stage
  - Total active applications count
  - Keep it compact (1-2 lines max) and dismissible or collapsible

- [x] Add sorting controls
  - Dropdown or small segmented button group
  - Options: Recently Updated (default), Company Name, Longest in Current Stage, Start Date, Status
  - Persist sort preference in `localStorage` (optional)

### Acceptance criteria

- [x] Applications are visually grouped by status with clear section headers
- [x] A user with 30+ applications can navigate to a specific group without scrolling the entire list
- [x] Summary band provides at least one actionable insight (e.g., "3 applications stalled >30 days")
- [x] Sorting controls are visible and functional
- [x] Changing sort order updates the list without a full page reload
- [x] Default sort (Recently Updated) is clearly indicated

---

## Issue 4: [P2] Wins treated identically to losses

**What:** Both `accepted` and `rejected` get the same `grayscale(0.4) brightness(0.85)` filter. A major victory is visually buried alongside a rejection.

**Why it matters:** Brand promises momentum and support. Suppressing a win is demotivating and contradicts the emotional goal.

### Sub-tasks

- [x] Remove grayscale filter from `accepted` applications
  - Keep full, saturated stage color (`--stage-accepted`)
  - Consider a subtle celebratory enhancement (see below)

- [x] Add a "win" indicator to accepted applications
  - Small checkmark icon or golden border on the accepted segment
  - Or a subtle `box-shadow` glow in the accent/amber color
  - Keep it tasteful — celebratory, not gaudy

- [x] Keep `rejected` applications muted
  - Retain existing `grayscale(0.4) brightness(0.85)`
  - Optionally add a subtle "×" or strike-through visual cue

- [x] Update `isQuieted` logic or naming
  - `isQuieted` currently returns `true` only for `rejected`
  - Either rename to `isMuted`/`isClosed` (applies to both) OR
  - Split into `isRejected` (mute) and `isAccepted` (celebrate)
  - Ensure the visual logic matches the semantic intent

### Acceptance criteria

- [x] Accepted applications are visually distinct from rejected applications
- [x] Accepted segments use full `--stage-accepted` color (no grayscale)
- [x] Rejected segments remain muted/grayscale
- [x] The distinction is obvious at a glance without reading text
- [x] Both light and dark mode handle the distinction correctly
- [x] A user scrolling through the list immediately spots their wins

---

## Issue 5: [P2] No sorting controls

**What:** Fixed sort by `updated_at` descending. Vertical sort fights the horizontal time axis.

**Why it matters:** "Which application spent the longest in interview?" is unanswerable without manual scanning.

### Sub-tasks

- [x] Add a sort control UI element
  - Native `<select>` or custom dropdown
  - Position: aligned with the timeline header or near the view switcher
  - Label: "Sort by" or icon + label

- [x] Implement sort strategies
  - **Recently Updated** (default): `updated_at` desc
  - **Company Name**: `company_name` asc
  - **Longest in Current Stage**: computed duration of trailing segment desc
  - **Start Date**: `created_at` asc (oldest first — matches temporal axis)
  - **Status**: group by status, then by `updated_at` desc within group

- [x] Wire sort state into `sortedApps` computed property
  - Ensure reactivity: changing sort updates the list immediately
  - Maintain stable sort (preserve relative order when keys are equal)

### Acceptance criteria

- [x] Sort control is visible and accessible
- [x] All 5 sort options produce correct, stable ordering
- [x] Changing sort does not require a page reload
- [x] Default sort (Recently Updated) is pre-selected on first load
- [x] Sort state persists across view switches (Timeline ↔ Board ↔ Table)
- [x] Keyboard users can operate the sort control (Tab + Enter/Space)

---

## Polish Pass (post-fixes)

### Sub-tasks

- [x] Fix terminal-stage 1-2px sliver bug
  - When `start === end` (closed application), render a small dot or pill instead of a near-zero-width bar
  - Minimum visual width of ~4px or a 6px circle

- [x] Fix single-month invisible axis
  - When all data falls within the current month, show at least one date anchor (e.g., "This month" or the current date)

- [x] Improve row accessibility
  - Add `aria-label` to each row: "{{company_name}} — {{role_title}}, currently {{status}}, started {{date}}"
  - Ensure focus indicators are visible (`focus-visible:ring` or similar)

- [x] Replace inline `style="min-height: 36px"` with Tailwind `min-h-9`

- [x] Review `overflow-visible` on bar container
  - Ensure segments never visually escape their track bounds

### Acceptance criteria

- [x] Terminal applications render as a visible dot/pill, not a sliver
- [x] Timeline axis has at least one visible anchor even in single-month views
- [x] Every timeline row has a meaningful `aria-label`
- [x] No inline `style` attributes remain where Tailwind utilities exist
- [x] All changes pass existing backend tests (`cd server && npm test`)
- [x] All changes pass E2E tests (`npm run build:client && cd client && npm run test:e2e`)

---

## Testing Checklist

- [x] Empty state renders correctly (no applications)
- [x] Empty state renders correctly (all applications closed, `closedCount > 0`)
- [x] Single application renders correctly
- [x] 30+ applications render performantly
- [x] All applications in same stage (trailing stripe wallpaper) is readable
- [x] Touch device: all interactions work without hover
- [x] Keyboard-only navigation: full access to rows, sorting, legend
- [x] Light mode: all colors, contrasts, and labels legible
- [x] Dark mode: all colors, contrasts, and labels legible
- [x] Reduced motion: no broken animations or layout shifts
- [x] Cross-browser: Chrome, Firefox, Safari (E2E tests cover this)

---

## Commands to Run (in priority order)

1. **`/colorize`** — Distinguish accepted from rejected; celebrate wins
2. **`/typeset`** — Fix label alignment, size, and typographic hierarchy
3. **`/clarify`** — Add stage legend and persistent segment labels
4. **`/layout`** — Group by status, add summary band, add sorting controls
5. **`/polish`** — Fix slivers, axis anchors, accessibility, code cleanup
