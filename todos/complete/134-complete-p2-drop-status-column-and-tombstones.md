# Drop the legacy status column and remove the status tombstones

- **Priority:** p2
- **Created:** 2026-10-15
- **Category:** cleanup (follow-up to the status removal in docs/plans/2026-10-14-0733-refactor-remove-legacy-status-plan.md)

## Problem

The release that removed `status` from REST, MCP and the UI left three things
in place for one release only: the `status` column (unread and unwritten), the
`update_status` MCP tool, and `PATCH /api/applications/:id/status` (410). They
were kept so an old client gets a clear error instead of a bare 404, and so a
database restore is the only rollback step.

## Proposed Solutions

### Option A: Remove them in the release after the status removal

- Delete the `update_status` tool and the `PATCH /:id/status` route, plus
  `STATUS_REMOVED_MESSAGE` and their tests.
- Drop the `status` column (`ALTER TABLE applications DROP COLUMN status`, guarded
  by a `_migrations` marker) after taking a backup.
- Remove the `status` declarations on the list/create/update tool schemas and the
  `rejectLegacyStatus` calls only if the loud error is no longer wanted; the
  argument guard may stay.
- Update `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `DEVELOPING.md`.
- **Effort**: Small | **Risk**: Medium (schema change; take a backup first)

## Acceptance Criteria

- [ ] `update_status` and `PATCH /:id/status` are gone
- [ ] `status` column dropped behind a migration marker, backup taken before deploy
- [ ] Docs and tool descriptions no longer mention the tombstones
- [ ] `cd server && npm test` and `cd client && npm run test:e2e` pass
