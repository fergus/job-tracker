---
status: pending
priority: p3
issue_id: "037"
tags: [security, owasp, input-validation]
dependencies: []
---

# Validate updated_since Query Parameter Format

## Problem Statement
In `server/routes/applications.js` line 118, the `updated_since` query parameter is pushed directly into SQLite query params without date format validation. While parameterization prevents SQL injection, a malformed value produces a silent empty result set with no error to the caller.

## Findings
- **OWASP A03 — Injection (informational):** No SQL injection risk due to parameterized queries, but the lack of validation is inconsistent with date handling elsewhere in the file.
- A value like `updated_since=not-a-date` returns an empty array instead of a 400, making bugs hard to diagnose.
- Note: todo 012 already identifies that `updated_since` needs a composite index and should append to the conditions array — this todo is specifically about adding format validation.

## Proposed Solution
In `server/routes/applications.js`, add a format guard before using `updated_since`:

```js
if (updated_since) {
  if (isNaN(Date.parse(updated_since))) {
    return res.status(400).json({ error: 'Invalid updated_since date format' });
  }
  conditions.push('updated_at > ?');
  params.push(updated_since);
}
```

## Acceptance Criteria
- [ ] `updated_since` with an invalid date returns HTTP 400 with a clear error message
- [ ] Valid ISO 8601 datetime strings continue to work correctly
- [ ] Empty/absent `updated_since` still returns all results as before

## Work Log
- 2026-03-25: Created from OWASP Top 10 security review
