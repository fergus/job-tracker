---
status: open
priority: p3
issue_id: "059"
tags: [ux, layout, application-panel, create-mode]
dependencies: []
---

# Reduce Job Description Textarea Height in Create Mode

## Problem

The job description textarea uses `rows="4"` by default, creating a large empty text area even when no content is entered. In create mode, this pushes the Save button below the fold on smaller screens — the primary action should be visible without scrolling.

## What to build

### 1. Reduce default rows
- Change `rows="4"` to `rows="2"` for the default state
- `resize-y` is already present, so users can expand manually if needed

### 2. Consider progressive disclosure in create mode
- In edit mode, the job description is already collapsible (markdown preview ↔ textarea)
- In create mode, consider starting collapsed or with a smaller footprint
- Alternatively, move job description into an expandable section for create mode

### 3. Ensure primary action visibility
- The "Create Application" button should ideally be visible above the fold for a first-time user
- If the form is still too long after reducing rows, consider whether Location or Job Description should be behind an "Advanced" toggle

## Notes

- Don't reduce below `rows="2"` — it needs to look like a text area, not an input
- The `resize-y` attribute is key — power users can still expand to paste long descriptions
- Check mobile bottom sheet specifically; vertical space is most constrained there
