---
status: complete
priority: p2
issue_id: "049"
tags: [ui, kanban, communication]
dependencies: []
---

# Staleness Indicator on Active-Stage Cards

Applications in `applied`, `screening`, or `interview` that haven't moved in 14+ days are quietly communicating "I may be dead." The interface currently says nothing. A subtle visual cue — muted amber/orange on the date text, plus a small warning dot — would communicate "this needs attention" without being alarming.

## Thresholds

- **14+ days** in an active stage: date text shifts to accent/amber, small dot indicator appears
- **30+ days**: stronger treatment — date shifts to danger color

## Stages to watch

`applied`, `screening`, `interview` only. Not `interested` (no urgency), not `offer` (good news), not terminal stages.
