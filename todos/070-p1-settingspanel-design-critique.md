---
status: complete
priority: p1
issue_id: "070"
tags: [design, ux, critique, settings, accessibility]
dependencies: []
---

# SettingsPanel Design Critique — Editorial Redesign + UX Hardening

## Problem Statement

The SettingsPanel component fails on three axes simultaneously:

1. **Data loss risk (P0):** Closing the panel discards all profile edits with no warning.
2. **Cognitive overload (P0):** All 14 profile fields + 3 textareas are visible at once under a single heading — 5 of 8 cognitive load checklist items fail.
3. **Brand mismatch:** The profile section feels like a tax form, not a "tactical, forward, sharp" campaign dossier. The generic two-column grid and flat hierarchy betray the editorial aesthetic defined in PRODUCT.md.

Nielsen's heuristics score: **24/40** (Acceptable — significant improvements needed).

---

## Findings

### From LLM Design Review
- Profile form is drifting into "every other settings page" territory — identical grids, generic stacking, no typographic personality
- No dirty-state protection; users lose work on backdrop click, X button, or Escape
- Sticky save button is locally scoped to Profile section — disappears when scrolling to API Keys
- Missing loading states for `loadProfile()` and `loadKeys()` — users see blank fields on slow connections
- Agent tuning fields ("Tone", "Emphasize", "Avoid") lack context for non-technical users
- Emotional journey evokes administrative burden, not armoring up for a campaign

### From Automated Detection
- CLI: 1 false positive (`bg-black/40` flagged as pure black)
- Invalid HTML: `<fieldset>` for markdown fields lacks required `<legend>`
- Missing focus restoration when panel closes
- Mobile drag handle has no `aria-hidden` — screen readers may announce empty group
- API key modal is `absolute` inside panel, not `fixed` to viewport — on mobile it only covers the sheet, not the page
- `position: sticky` inside `overflow-y-auto` is unreliable on iOS Safari
- Silent error swallowing on `loadProfile()`, `loadKeys()`, clipboard copy, and revoke
- `setTimeout` for `profileSaved` has no cleanup on unmount

---

## Proposed Solutions

### Phase 1: Editorial Boldness (Brand Mismatch)
Transform the profile from a database form into a campaign dossier. Stronger section hierarchy, purposeful typography, and a sense of forward momentum.

- **Effort:** Medium
- **Risk:** Low

### Phase 2: Progressive Disclosure (Cognitive Overload)
Collapse the 14-field wall into 5 expandable sub-sections. Default-open the high-value sections (Personal, Documents), collapse the rest.

- **Effort:** Medium
- **Risk:** Low

### Phase 3: Data Loss Prevention + Hardening (P0)
Add dirty-state tracking, close confirmation, loading skeletons, auto-save or global sticky save, and fix silent failures.

- **Effort:** Medium
- **Risk:** Low

---

## Technical Details

- **Affected files:**
  - `client/src/components/SettingsPanel.vue` (primary)
  - `client/src/assets/main.css` (possible token additions)
  - `client/src/App.vue` (possible focus restoration coordination)

---

## Sub-Tasks & Acceptance Criteria

### `/bolder` — Editorial Visual Transformation
- [x] Section headers have stronger visual authority (larger scale, weight contrast, or accent treatment)
- [x] Profile section no longer reads as a generic SaaS form grid
- [x] Overall composition feels closer to "mission board" or "editorial spread" than "database admin"
- [x] Color usage beyond functional buttons — consider subtle section tints or accent-led hierarchy

### `/typeset` — Typographic Hierarchy
- [x] Section headings use the condensed font (`font-condensed`) for editorial contrast
- [x] Label/input hierarchy is clear — labels must not compete with input text for attention
- [x] CV markdown textarea feels intentionally monospaced, not accidentally so
- [x] Remove flat scale — ensure ≥1.25 ratio between typographic steps (section header → label → input → helper)

### `/distill` — Progressive Disclosure
- [x] Profile fields grouped into ≤5 collapsible sub-sections:
  - Personal (full name, city, country)
  - Targets (target roles, compensation currency, compensation range)
  - Links (LinkedIn, portfolio)
  - Agent Tuning (tone, emphasize, avoid)
  - Documents (CV markdown, career narrative, agent instructions)
- [x] Default-open: Personal and Documents
- [x] Default-closed: Targets, Links, Agent Tuning
- [x] Each section has a clear expand/collapse affordance with transition animation
- [x] Section headers show a completion indicator (e.g., "3/5 fields filled") or subtle "filled" state

### `/harden` — Data Loss Prevention + Error Handling
- [x] Track dirty state across all profile fields (deep comparison or flag on input)
- [x] Intercept close attempts (backdrop click, X button, Escape) when dirty — show confirmation dialog
- [x] Add loading skeleton or shimmer state while `loadProfile()` fetches
- [x] Add loading state while `loadKeys()` fetches (distinguish from "No API keys yet.")
- [x] `setTimeout` for `profileSaved` clears on component unmount
- [x] `loadProfile()` and `loadKeys()` errors show inline error message, not silent empty state
- [x] Clipboard copy failure shows fallback UI (auto-select text or "Press Ctrl+C")
- [x] Revoke error shows feedback instead of silently ignoring

### `/layout` — Spatial Fixes
- [x] Save action is globally discoverable regardless of scroll position:
  - Option A: Save bar sticks to panel bottom (not section bottom), visible across all sections
  - Option B: Auto-save with per-field "Saved" indicators — no save button needed
- [x] Drop `md:grid-cols-2` inside the 480px drawer — use single column or `sm:` breakpoint
- [x] Add bottom padding to scrollable container so last field isn't obscured by sticky bar
- [x] Fix `min-h-[44px]` on inline revoke buttons causing visual jitter in key list rows

### `/clarify` — UX Copy
- [x] Agent Instructions sub-section has a one-line helper explaining what consumes these fields
- [x] Agent tuning labels include microcopy: "These instructions guide the AI when generating resumes and cover letters"
- [x] Profile intro text feels inspiring, not administrative (if changed)
- [x] Empty API key state has a call-to-action or brief explanation of what keys are for

### `/adapt` — Mobile UX
- [x] API key modal uses `fixed` positioning covering the full viewport on mobile, not just the sheet
- [x] Mobile drag handle has `aria-hidden="true"` (or proper role if meant to be interactive)
- [x] Test `position: sticky` save bar on iOS Safari — if unreliable, switch to `fixed` or alternative
- [x] Consider adding swipe-down-to-dismiss on mobile drag handle area
- [x] Verify touch targets remain ≥44×44pt after layout changes

### `/audit` — Accessibility
- [x] Fix invalid HTML: second `<fieldset>` (markdown fields) has a proper `<legend>` or is replaced with `<section>` + heading
- [x] Focus returns to the settings trigger button when panel closes
- [x] "Copy to clipboard" → "✓ Copied" text change is announced via `aria-live="polite"`
- [x] Profile section description is linked to first form field via `aria-describedby`, or fields link to helper text
- [x] Save button has `aria-busy="true"` during save operation
- [x] All inputs with helper text use `aria-describedby` linking to the helper

### `/polish` — Final Quality Pass
- [x] Consistent checkmark iconography: replace unicode ✓ in "Copied" button with SVG checkmark
- [x] Extend `profileSaved` timeout from 2000ms to 4000ms for accessibility
- [x] `bg-panel/95` in key modal changed to solid `bg-panel`
- [x] Visual spacing rhythm is intentional — no mechanical `space-y-6` everywhere
- [x] Dark mode passes visual QA — no broken contrast or misplaced borders after layout changes

---

## Nielsen's Heuristics Target

Goal: improve from **24/40** to **32/40** (Good band).

| Heuristic | Current | Target | How |
|-----------|---------|--------|-----|
| Visibility of System Status | 2 | 4 | Loading states, dirty indicators, persistent save feedback |
| Match System / Real World | 3 | 4 | Better copy, dossier metaphor |
| User Control and Freedom | 3 | 4 | Dirty-state close guard |
| Consistency and Standards | 3 | 3 | Already solid |
| Error Prevention | 2 | 3 | Close confirmation, input validation |
| Recognition Rather Than Recall | 3 | 4 | Progressive disclosure, contextual help |
| Flexibility and Efficiency | 2 | 3 | Auto-save or keyboard save |
| Aesthetic and Minimalist Design | 2 | 4 | Collapsed sections, editorial hierarchy |
| Error Recovery | 2 | 3 | Error messages, undo on revoke |
| Help and Documentation | 2 | 3 | Inline helpers, agent tuning context |

---

## Work Log

- 2026-04-30: Created from `/critique settingspanel` design review (LLM + automated detection)
- 2026-04-30: Implemented all fixes — progressive disclosure, dirty-state guard, editorial styling, loading states, error handling, accessibility hardening, mobile UX fixes
- 2026-04-30: Post-critique fixes — default Documents to collapsed, add `inert`/`aria-hidden` to panel when modal is open
- 2026-04-30: Score improved from 24/40 to 35/40 (Acceptable → Good)
