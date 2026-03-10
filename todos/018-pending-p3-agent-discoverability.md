---
status: pending
priority: p3
issue_id: "018"
tags: [code-review, agent-native, documentation]
dependencies: []
---

# Add _README.md to Sync Root for Agent Discoverability

## Problem Statement
The filesystem layout implies certain operations but there's no manifest or documentation visible to agents explaining the conventions.

## Findings
- **Agent-Native Reviewer Observation #1:** No README or manifest file tells agents what operations are possible. A read-only _README.md serves as the filesystem equivalent of a system prompt.
- **Agent-Native Reviewer Observation #3:** interview-notes.md → interview_notes mapping uses hyphens-to-underscores that isn't documented in the filesystem itself.

## Proposed Solutions
### Solution 1: Read-only _README.md in sync root
Document: directory structure, how to create/edit/move/delete applications, file-to-field mapping, expected latencies, and the notes.md format.
- **Effort:** Small
- **Risk:** None

## Acceptance Criteria
- [ ] _README.md placed in each user's sync root
- [ ] File is regenerated on each fullSync (not editable)
- [ ] Documents all filesystem operations and their semantics

## Work Log
- 2026-03-09: Created from technical review (agent-native reviewer)
