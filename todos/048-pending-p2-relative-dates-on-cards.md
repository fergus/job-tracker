---
status: open
priority: p2
issue_id: "048"
tags: [ui, kanban, communication]
dependencies: []
---

# Relative Dates on Kanban Cards

`formatDate()` in `KanbanCard.vue` outputs a locale date string (e.g. "4/21/2026"). This communicates *a record field*. "2 days ago" or "3 weeks ago" communicates *staleness* — which is what a campaigner actually needs. An application sitting in "Applied" for 6 weeks currently looks identical to one added yesterday.

## Change

Replace `toLocaleDateString()` with a relative formatter using `Intl.RelativeTimeFormat`. Thresholds: same day → "today", <7 days → "N days ago", <30 days → "N weeks ago", else → "N months ago".
