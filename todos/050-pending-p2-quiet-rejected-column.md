---
status: open
priority: p2
issue_id: "050"
tags: [ui, kanban, communication]
dependencies: []
---

# Visual Quieting of the Rejected Column

The rejected column has the same visual weight as every active stage, communicating "this is equivalent to Screening or Interview." It isn't — it's closed, final. Reducing the visual presence of rejected cards would communicate "stop carrying this" rather than making rejections compete for attention alongside live opportunities.

## Approach

- Reduce card opacity in the rejected column (e.g. `opacity-50` on hover-out, full on hover)
- Desaturate/mute card text — use `ink-3` for company name instead of `ink`
- Optionally: collapse the column behind a disclosure ("N rejected — show") so it's accessible but not the default view
