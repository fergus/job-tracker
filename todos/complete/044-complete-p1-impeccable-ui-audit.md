---
status: complete
priority: p1
issue_id: "044"
tags: [design, accessibility, theming, performance]
dependencies: []
---

# Impeccable UI Audit — Design & Accessibility Overhaul

## Audit Score: 9/20 (Poor)

Full audit run 2026-04-21 via `/impeccable:audit`. The app is functionally solid but has no
design token system, no dark mode, WCAG AA contrast failures, and zero visual personality
against its "tactical, forward, sharp" brand brief.

## Findings by Dimension

| Dimension | Score | Key Finding |
|-----------|-------|-------------|
| Accessibility | 2/4 | Contrast failures on `text-gray-400`, missing `aria-sort`, no focus trap, no form labels |
| Performance | 3/4 | Sound overall; `renderMarkdown()` not memoized; redundant `loadAttachments` on mount |
| Responsive Design | 2/4 | Good layout patterns; touch targets consistently <44px; no container queries |
| Theming | 0/4 | No design tokens, no dark mode, hardcoded hex in scoped styles |
| Anti-Patterns | 2/4 | No explicit AI slop; but system fonts, uniform spacing, no visual identity |

## Critical Issues (P0)

- **No dark mode** — user-chosen "system adaptive" theme is completely unimplemented
- **Zero design token system** — every color is a hardcoded Tailwind utility or inline hex; `stageColor()` in `utils/timeline.js` returns raw hex values; `ApplicationPanel.vue:823–836` has hardcoded `#f3f4f6`, `#d1d5db`, `#2563eb`, `#6b7280` in scoped styles
- **WCAG AA contrast failures** — `text-gray-400` (#9CA3AF on white = 2.6:1; needs 4.5:1) used for timestamps, labels, empty states throughout the app (`KanbanCard.vue:14`, `ApplicationPanel.vue:189,217`, `TableView.vue:35-36`, `TimelineView.vue:41`)

## Major Issues (P1)

- **No form labels on company/role inputs** — `ApplicationPanel.vue:34-43` uses placeholder only; violates WCAG 1.3.1, 2.4.6
- **Missing `aria-sort`** on sortable `<th>` elements — `TableView.vue:6-15`; sort state communicated only via ▲/▼ characters
- **Missing `aria-pressed`** on status selection pills — `ApplicationPanel.vue:60-67`; selected state not announced to screen readers
- **No focus trap** in `ApplicationPanel` or `SidebarMenu` — Tab escapes into obscured background content
- **Touch targets below 44px** — `p-2` icon buttons (36×36px) throughout `App.vue:54-72`, `ApplicationPanel.vue:45-53`, note/attachment delete buttons
- **System font stack** — no font imported anywhere; zero typographic personality for a "tactical, forward, sharp" brand

## Minor Issues (P2)

- **Markdown blockquote side-stripe** — `ApplicationPanel.vue:832`: `border-left: 3px solid #d1d5db` (absolute ban pattern, even in prose context)
- **Uniform spacing throughout** — `px-5 py-4 space-y-5` used uniformly; no rhythm or hierarchy
- **No stage advancement animation** — clicking "Interview" looks identical to clicking "Applied"; the emotional core of the app is silent
- **`renderMarkdown()` not memoized** — called on every render for each note in `ApplicationPanel.vue:802-804`
- **No container queries** — all responsive adaptation is viewport-based; `KanbanCard` doesn't adapt to column width

## Polish Issues (P3)

- **Anemic empty states** — `TimelineView.vue:4-6` and `TableView.vue:38` just say "nothing here" with no teaching value
- **Table lacks `aria-label`/`<caption>`** — `TableView.vue:3`
- **Redundant `loadAttachments` call** — `ApplicationPanel.vue:463-465` and `:498` both call it on mount for edit mode

## Recommended Actions (in order)

- [x] **`/colorize`** (P0) — Build OKLCH design token system, light + dark themes, distinctive "tactical, forward, sharp" palette; move `stageColor()` to CSS variables
- [x] **`/harden`** (P1) — Fix WCAG violations: form labels, `aria-sort`, `aria-pressed`, focus trapping, empty state copy
- [x] **`/adapt`** (P1) — Fix touch targets (min 44px); add container queries to `KanbanCard`
- [x] **`/typeset`** (P2) — Replace system fonts with a distinctive pairing; establish type scale with real hierarchy
- [x] **`/animate`** (P2) — Add purposeful motion to stage advancement and panel transitions
- [x] **`/layout`** (P2) — Break uniform spacing; create rhythm and hierarchy in panel and kanban
- [x] **`/polish`** (P3) — Blockquote style, redundant mount call, emoji → SVG icons in KanbanCard, `&times;` → SVG in ApplicationPanel, `text-line-2` token misuse fixed, `text-gray-300` hardcoded in TimelineView tooltip fixed
- [x] **`/harden` (round 2)** — SettingsPanel: `role="dialog" aria-modal="true"`, focus trap, `role="alert"` on error; TimelineView rows: `@keydown.space`; App.vue Add button: `min-h-[44px]`
- [x] **`/colorize` (round 2)** — SettingsPanel: `bg-green-100/text-green-600` → `bg-accent-muted/text-accent`; `text-red-600` → `text-danger`; `ease-in-out` → `ease-out-expo`
- [x] **`/optimize`** — `renderMarkdown()` memoized with Map cache; `lastActivity()` pre-computed before sort in TableView

## Acceptance Criteria

- [x] Audit re-run scores ≥ 16/20 — **scored 16/20 (2026-04-22); post-round-2 fixes estimated 18/20**
- [x] Dark mode works correctly on system preference change
- [x] No `text-gray-400` used for readable content
- [x] All interactive elements meet 44px touch target minimum
- [x] `aria-sort`, `aria-pressed`, form labels in place
- [x] Focus trapped within open overlays

## Work Log

- 2026-04-21: Initial audit run via `/impeccable:audit`; design context established in `.impeccable.md` and `CLAUDE.md`
- 2026-04-21: `/colorize` complete — OKLCH token system in `main.css`, dark mode via `@media (prefers-color-scheme: dark)`, amber-bronze accent, semantic stage color pairs; all 10 components + `timeline.js` updated; `stageColor()` now returns CSS variable refs; trailing segments use `color-mix()` for alpha; blockquote border-left stripe replaced with background tint
- 2026-04-21: `/harden` complete — `aria-label` on company/role inputs; `aria-pressed` on status pills; focus trap (Tab wrapping) + `role="dialog" aria-modal="true"` in `ApplicationPanel` and `SidebarMenu`; `aria-sort` + `scope="col"` + `aria-label` on `TableView` table/headers; sort indicators marked `aria-hidden`; `TimelineView` empty state now has heading + descriptive CTA
- 2026-04-21: `/adapt` complete — all `p-2` icon buttons (settings, menu, close buttons across `App.vue`, `ApplicationPanel`, `SettingsPanel`, `SidebarMenu`) lifted to `size-11` (44px); all `×` delete buttons in `ApplicationPanel` lifted to `min-h-[44px] min-w-[44px]`; `@container` added to kanban column div; `KanbanCard` now uses `p-2 @[200px]:p-3` padding and hides date/indicator row at columns narrower than 200px
- 2026-04-21: `/typeset` complete — Barlow (400/500/600) + Barlow Condensed (600/700) loaded via Google Fonts in `index.html` with `font-display: swap`; `--font-sans` and `--font-condensed` registered in `@theme inline` in `main.css`; `font-condensed` applied to `App.vue` h1 (+ `tracking-wide`), `KanbanBoard` stage headers (+ `tracking-wider`), `KanbanCard` company name, `ApplicationPanel` company name input, `TableView` company cells; `tabular-nums` added to `TableView` date column
- 2026-04-21: `/animate` complete
- 2026-04-22: `/layout` complete — removed uniform `space-y-5`; primary fields wrapped in `space-y-4`; dates section gets `mt-7 pt-5 border-t border-line` structural separator; journey `mt-4`, attachments `mt-6`, notes `mt-6`; note cards `p-2 → p-3`, add-form `gap-2 mb-3 → gap-3 mb-4`; header `pt-3/pb-3 → pt-5/pb-4`, status bar `py-2.5 → py-3`, footer `py-3 → py-4`; create-mode files section gets same `border-t` separator; KanbanCard padding `p-2 → p-3 @[200px]:p-4`, role `mt-0.5 → mt-1`, date row `mt-2 → mt-3`; KanbanBoard column gap `gap-4 → gap-5`, stage header `mb-3 → mb-4` — motion token section added to `main.css` (`--ease-out-expo`, `--ease-out-quart`, `--ease-in-expo`; `.stage-stamp` keyframe animation; `.view-enter/leave-active` crossfade classes; `.ease-out-expo/quart` utility classes; global `prefers-reduced-motion: reduce` rule); `ApplicationPanel.vue`: panel entrance uses `ease-out-expo` (replaces `ease-in-out`), `stampingStatus` ref triggers `.stage-stamp` pulse on status pill when advancing to a new stage; `KanbanCard.vue`: hover lift (`hover:-translate-y-0.5` + `transition-[transform,box-shadow] duration-200 ease-out-quart`); `App.vue`: `<Transition name="view" mode="out-in">` crossfade wraps Board/Table/Timeline views
