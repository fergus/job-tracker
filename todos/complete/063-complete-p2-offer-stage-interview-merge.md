---
status: closed
priority: p2
issue_id: "063"
tags: [ui, kanban, pipeline, ux]
dependencies: []
---

# Merge Offer Stage into Interview Column

## Problem

The Offer column added visual weight and split focus at the end of the active pipeline. For most job seekers, "offer received" is a milestone within the interview phase rather than a distinct stage requiring its own column.

## What was built

- Removed the Offer column from the desktop and mobile kanban board
- Applications with `status='offer'` now appear in the Interview column
- A small "Offer" badge (using `--stage-offer-bg` / `--stage-offer-fg` tokens) is shown on the card below the role title when `application.status === 'offer'`
- The ApplicationPanel status pills are unchanged — users can still advance to "offer" from within Interview
- `offer` added to `STALE_STAGES` in KanbanCard so staleness indicators still fire

## Change log

| Date | Change | Files |
|------|--------|-------|
| 2026-04-26 | Removed offer from `activeStages` and `mobileActiveGroup.stages` | `KanbanBoard.vue` |
| 2026-04-26 | Watch merges `status='offer'` into `columns.interview` | `KanbanBoard.vue` |
| 2026-04-26 | Added Offer badge to KanbanCard | `KanbanCard.vue` |
| 2026-04-26 | Fixed badge to use design-system tokens (`--stage-offer-bg/fg`) after code review | `KanbanCard.vue` |
