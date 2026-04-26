---
status: open
priority: p3
issue_id: "060"
tags: [ux, onboarding, first-run, application-panel]
dependencies: []
---

# Add Onboarding Guidance for First Application

## Problem

A new user opening the panel for the first time sees Notes → URL → Salary → Location → Description with no guidance on what matters most or how the pipeline works. The first application creation is a high-stakes moment — even deliberate users need orientation.

## What to build

### 1. One-time dismissible tip in the notes section
- Show a small info callout on the first application: "Tip: Add a note for every interaction — interviews, follow-ups, rejections. This builds your Journey timeline automatically."
- Dismissible with an X; never shown again after dismissal
- Store dismissal in localStorage

### 2. Enhanced empty state as onboarding
- The notes empty state (see todo 058) can double as onboarding: "No notes yet — this is where you build your paper trail. Every note powers your Journey timeline."

### 3. Optional: first-run spotlight
- Briefly highlight the status bar on first open: "Track your progress through the pipeline by changing status here."
- Keep it subtle — no blocking modals or forced tours

## Notes

- The brand voice is tactical and forward — onboarding should feel like advice from a mentor, not a tutorial
- Avoid blocking UI; use inline tips and empty-state copy instead
- Consider whether the tip should appear in create mode, edit mode, or both
- If the user already has applications, skip onboarding entirely
