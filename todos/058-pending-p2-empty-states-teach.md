---
status: open
priority: p2
issue_id: "058"
tags: [ux, copy, empty-state, onboarding]
dependencies: []
---

# Make Empty States Teach Instead of Dead-End

## Problem

Empty states in the ApplicationPanel are dead-end statements: "No notes yet." and "No attachments." First-time users hit these and get no guidance on *why* notes matter or *what* to attach. This misses an opportunity to teach the interface and reinforce the product's value.

## What to build

### 1. Notes empty state — teach the habit
- Replace "No notes yet." with: "No notes yet — add one to track every interaction with this company."
- Optional: mention that notes build the Journey timeline automatically

### 2. Attachments empty state — suggest action
- Replace "No attachments." with: "No attachments — upload your CV or cover letter."
- Keep the "Upload files" link prominent directly below

### 3. Consistent tone across all empty states
- Check TableView, KanbanBoard, and TimelineView for similar dead-end empty states
- Ensure all empty states follow the same pattern: acknowledge emptiness + explain value + suggest action

## Notes

- Empty states are the best onboarding tool — they appear at the exact moment the user needs guidance
- Keep copy concise (1-2 sentences max) and action-oriented
- Match the tactical, forward brand voice: "No notes yet — start building your paper trail."
