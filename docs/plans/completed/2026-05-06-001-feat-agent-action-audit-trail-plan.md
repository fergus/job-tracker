---
title: Application Activity Audit Trail
type: feat
status: complete
date: 2026-05-06
origin: docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md
---

# Application Activity Audit Trail

## Overview

Add a persistent audit trail that records every data-mutating action performed on an application — whether by a human through the browser frontend, an agent via MCP tools, or a programmatic client via REST API. The trail is surfaced in the application panel as a chronological timeline, giving users complete visibility into what changed, when, who changed it, and through which interface.

---

## Problem Frame

Both humans and agents can create, update, and delete job applications, notes, attachments, and generated documents through the web UI, REST API, and MCP server. Today these mutations leave no persistent record. A user who returns to an application — after an agent session or even their own editing session — has no way to know what changed, when, or why. This erodes trust in agent-generated output, makes collaborative editing opaque, and makes debugging any unexpected state impossible.

(see origin: docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md, idea #7)

---

## Requirements Trace

- R1. Every data-mutating action (MCP tool, REST endpoint, or browser frontend) is persisted to an `audit_log` table.
- R2. Each audit record captures: actor (`user_email`), action name, target application, source interface (`mcp` or `rest`), auth method (`api_key` or `oauth`), timestamp, and a JSON summary of what changed.
- R3. Audit logging is fire-and-forget: failures are swallowed and console-logged, never blocking the original operation.
- R4. A read-only endpoint `GET /api/applications/:id/audit-log` returns the audit trail for an application, scoped to the owner or admin.
- R5. Admin access to another user's audit trail is console-logged (`[admin] ...`) following the existing pattern.
- R6. The frontend displays the full audit timeline inside `ApplicationPanel.vue`, sorted newest-first, with visual distinction between human (OAuth/browser) and agent (API key/MCP) actions.
- R7. Audit records are cascaded when an application is deleted (`ON DELETE CASCADE`).

---

## Scope Boundaries

- **In scope:** Logging all mutations from MCP tools, REST endpoints (any auth method), and browser frontend; database schema; read endpoint; frontend timeline display with human vs agent distinction.
- **Not in scope:** Read-operation auditing; full before/after object diffs in the `details` column; agent-provided rationale strings; real-time audit streaming; audit log export or retention policies.
- **Deferred to follow-up work:** Before/after diffs for complex updates; agent rationale field; bulk audit analytics; automatic pruning of old records.

---

## Context & Research

### Relevant Code and Patterns

- **Database migrations:** `server/db.js` uses `CREATE TABLE IF NOT EXISTS` for new tables and `PRAGMA table_info` + `ALTER TABLE` for column additions. Prepared statements are attached to the `db` object for runtime use.
- **MCP tool registration:** `server/mcp.js` registers 14 tools via `server.tool(name, description, schema, handler)`. All tool handlers receive `(args, extra)` where `extra.authInfo.clientId` is the user email.
- **Auth middleware:** `server/middleware/auth.js` sets `req.userEmail`, `req.isAdmin`, and `req.authMethod` (`'api_key'` or `'oauth'`). MCP uses API keys exclusively.
- **Existing audit pattern:** Admin cross-user access is logged via `console.info('[admin] %s ...', req.userEmail, ...)` in `server/routes/applications.js`.
- **Service layer mutations:** `server/services/applications.js` provides `createApplication`, `updateApplication`, `updateStatus`, `deleteApplication`, `addNote`, and `uploadAttachments`.
- **Mixed-layer tools:** `generate_document`, `extract_job_description`, and `fetch_job_description` in `server/mcp.js` perform direct `db.run()` and `fs.writeFileSync` inside the tool handler rather than delegating purely to the service layer.
- **Frontend structured lists:** `ApplicationPanel.vue` renders notes and attachments as styled lists with badges, timestamps, and collapsible `<details>` sections using design tokens (`bg-raised`, `text-ink-2`, `border-line`, etc.).

### Institutional Learnings

- `docs/solutions/logic-errors/file-cleanup-ordering-orphaned-uploads-2026-04-23.md` — Database transactions are the source of truth; filesystem operations are side effects. The same principle applies to audit logging: the primary operation must never depend on the audit write succeeding.

### External References

- None required — local patterns are sufficient.

---

## Key Technical Decisions

- **Central MCP wrapper vs inline logging:** A central wrapper around `server.tool()` captures all mutating tools uniformly without touching individual handler bodies. A deny-list identifies read-only tools to skip.
- **REST audit via inline helper:** REST routes do not share a common wrapper, so a reusable `logAuditEvent()` helper is called explicitly in each mutation route handler. This mirrors the existing explicit `console.info('[admin] ...')` pattern. All auth methods are logged — both `api_key` (agents) and `oauth` (browser).
- **Details JSON is lightweight, not a full diff:** For v1, `details` stores a small action-specific summary (e.g., `{ old_status, new_status }`, `{ fields_changed: [...] }`, `{ task }`). Full before/after diffs add serialization complexity and are deferred.
- **Source enum:** `source` distinguishes `'mcp'` from `'rest'` so users can see which interface was used.
- **Auth method enum:** `auth_method` distinguishes `'api_key'` (agent/programmatic) from `'oauth'` (human/browser) so the UI can visually distinguish human actions from agent actions.
- **No MCP read endpoint for v1:** Agents query data via existing tools; an MCP audit-read tool is deferred until a concrete use case emerges.

---

## Open Questions

### Resolved During Planning

- **Should browser/OAuth actions also be persisted?** Yes — the scope was expanded to provide a unified activity timeline. Both human and agent mutations are logged. The `auth_method` column allows the UI to distinguish them.
- **What if the audit INSERT fails?** Swallow the error, log to console, and do not fail the original operation. This follows the orphaned-uploads learning: side effects must not compromise the primary operation.
- **Should `details` be a string or JSON?** Store as JSON text in a `TEXT` column (same pattern as `applications.extracted_jd`). SQLite has no native JSON type, but `JSON.stringify`/`JSON.parse` is the convention.
- **Should the table be `agent_actions` or something more general?** Use `audit_log` — the scope now covers all actions, not just agents.

### Deferred to Implementation

- **Exact `details` shape per action:** The helper will accept a plain object; the route/tool will populate it contextually. Final shapes will be determined during implementation.
- **Whether to include attachment/ note IDs in details:** Include when readily available; omit if it requires extra queries.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
MCP tool call (mutating)
  → server.tool() wrapper
    → original handler runs
    → on success: logAgentAction({ userEmail, action, appId, source: 'mcp', details })

REST mutation (API key auth)
  → route handler
    → primary DB write succeeds
    → logAgentAction({ userEmail, action, appId, source: 'rest', details })

Frontend
  → ApplicationPanel.vue loads app
    → fetches /api/applications/:id/agent-actions
    → renders collapsible timeline sorted newest-first
```

---

## Implementation Units

- [ ] U1. **Database schema — `agent_actions` table**

**Goal:** Create the persistent store for audit records.

**Requirements:** R1, R7

**Dependencies:** None

**Files:**
- Modify: `server/db.js`

**Approach:**
- Add `CREATE TABLE IF NOT EXISTS agent_actions (...)` with columns: `id`, `application_id`, `user_email`, `action`, `source`, `auth_method`, `details`, `created_at`.
- Add `CREATE INDEX IF NOT EXISTS idx_agent_actions_app_created ON agent_actions(application_id, created_at DESC)` for efficient timeline queries.
- Attach a prepared statement `db.insertAgentAction` to the `db` object.

**Patterns to follow:**
- Mirror the `users` and `api_keys` table creation patterns in `server/db.js`.

**Test scenarios:**
- Test expectation: none — schema migration verified by subsequent units.

**Verification:**
- `PRAGMA table_info(audit_log)` shows all expected columns.

---

- [ ] U2. **Audit logging service**

**Goal:** Provide a reusable, fire-and-forget helper for recording audit events.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Create: `server/services/audit.js`

**Approach:**
- Export `logAuditEvent({ userEmail, action, applicationId, source, authMethod, details })` where `details` is an optional plain object.
- Inside: serialize `details` to JSON, call `db.insertAuditLog.run(...)`, wrap in try/catch that logs failures to console and never throws.
- Export a `READ_ONLY_TOOLS` set for the MCP wrapper to reference.

**Patterns to follow:**
- Error-swallowing pattern from `safeDeleteFile` in `server/services/applications.js`.
- Prepared-statement usage from `server/db.js`.

**Test scenarios:**
- Happy path: valid inputs → row inserted, no error thrown.
- Edge case: `details` is undefined/null → stored as NULL.
- Error path: database failure → function returns silently, console error emitted, original caller unaffected.

**Verification:**
- Service can be imported and unit-tested with an in-memory database.

---

- [ ] U3. **MCP tool audit wrapper**

**Goal:** Capture all mutating MCP tool invocations without modifying individual handlers.

**Requirements:** R1, R2, R3

**Dependencies:** U2

**Files:**
- Modify: `server/mcp.js`

**Approach:**
- Immediately after `const server = new McpServer(...)`, monkey-patch `server.tool`:
  - Save the original method.
  - Override it to wrap the handler: if the tool name is not in `READ_ONLY_TOOLS`, call `logAgentAction(...)` with `source: 'mcp'` after the original handler succeeds.
  - Pass `userEmail` from `extra.authInfo.clientId`, `action` from the tool name, and `applicationId` from `args.id` or `args.application_id` when present.
  - `create_application` has no application ID in args; log it without `applicationId` and include `company_name` and `role_title` in `details`.
  - If the handler throws or returns an error result, do not log an audit record.

**Patterns to follow:**
- The auth-extraction pattern `extra.authInfo?.clientId` used in every tool handler.

**Test scenarios:**
- Happy path: mutating tool succeeds → audit row created with `source: 'mcp'`, `auth_method: 'api_key'`.
- Edge case: read-only tool invoked → no audit row created.
- Error path: mutating tool fails (throws or returns `isError`) → no audit row created.
- Integration: `generate_document` success → audit row includes `task` in details.

**Verification:**
- MCP tests confirm audit rows are created for successful `create_application`, `update_status`, and `add_note`.

---

- [ ] U4. **REST route audit logging**

**Goal:** Log agent mutations that come through REST endpoints with API key auth.

**Requirements:** R1, R2, R3

**Dependencies:** U2

**Files:**
- Modify: `server/routes/applications.js`

**Approach:**
- After each successful mutation in the route handlers, conditionally call `logAgentAction` when `req.authMethod === 'api_key'`.
- Affected routes: `POST /`, `PUT /:id`, `PATCH /:id/status`, `POST /:id/notes`, `PUT /:id/notes/:noteId`, `DELETE /:id/notes/:noteId`, `POST /:id/attachments`, `DELETE /:id/attachments/:attachmentId`, `POST /:id/cv`, `POST /:id/cover-letter`, `PATCH /:id/dates`, `DELETE /:id`, `POST /:id/generate`, `POST /:id/extract-jd`, `POST /:id/fetch-jd`.
- For `POST /`, log after `svc.createApplication` returns and include the new application ID in `details`.
- Populate `details` with action-specific context (e.g., `{ status }` for status changes, `{ task }` for generation).

**Patterns to follow:**
- Existing admin `console.info('[admin] ...')` logging pattern, but using the audit service instead.

**Test scenarios:**
- Happy path: API-key-authenticated `POST /api/applications` → audit row created with `source: 'rest'`.
- Edge case: OAuth-authenticated `POST /api/applications` → no audit row created.
- Error path: mutation fails validation → no audit row created.
- Integration: `POST /api/applications/:id/generate` with API key → audit row includes `task: 'cover_letter'`.

**Verification:**
- Backend tests confirm audit rows for REST mutations using API key auth, and no rows for OAuth auth.

---

- [ ] U5. **REST endpoint for reading audit trail**

**Goal:** Allow the frontend (and API consumers) to fetch an application's audit history.

**Requirements:** R4, R5

**Dependencies:** U1

**Files:**
- Modify: `server/routes/applications.js`
- Test: `server/test/api.test.js`

**Approach:**
- Add `GET /api/applications/:id/audit-log`.
- Ownership check: owner or admin. Admin access is console-logged with `[admin] ...`.
- Query: `SELECT * FROM audit_log WHERE application_id = ? ORDER BY created_at DESC`.
- Return JSON array of audit records. Parse `details` from JSON text to object before returning.

**Patterns to follow:**
- Ownership and admin audit pattern from `GET /api/applications/:id/context`.

**Test scenarios:**
- Happy path: owner fetches audit trail → 200 with sorted array (newest first).
- Edge case: no audit records → 200 with empty array.
- Error path: non-owner, non-admin → 403.
- Integration: admin fetches another user's trail → 200, console info emitted.

**Verification:**
- Backend tests pass; manual curl returns expected shape.

---

- [ ] U6. **Frontend audit timeline UI**

**Goal:** Surface agent actions in the application panel so users can see what agents changed.

**Requirements:** R6

**Dependencies:** U5

**Files:**
- Modify: `client/src/api.js`
- Modify: `client/src/components/ApplicationPanel.vue`

**Approach:**
- Add `fetchAuditLog(appId)` to `client/src/api.js`.
- In `ApplicationPanel.vue`, add a new collapsible `<details>` section (same pattern as "Journey" and "Attachments") titled "Activity".
- Fetch audit log when the panel opens or when the application changes.
- Render each entry as a list item with: action name (humanized), actor badge (`You` for oauth, `Agent` for api_key), source badge (`MCP`, `Web`, or `API`), relative timestamp, and an expandable details view showing the JSON summary.
- Use existing design tokens: `bg-raised`, `text-ink-2`, `text-xs`, `border-line`.
- For `oauth` actions, show a subtle user icon/badge; for `api_key` actions, show an agent/robot icon/badge.

**Patterns to follow:**
- Notes list rendering pattern in `ApplicationPanel.vue`.
- API client named-export pattern.

**Test scenarios:**
- Test expectation: none for pure UI — E2E tests cover interaction.

**Verification:**
- E2E test: user opens an application, expands "Activity", sees both their own edits and agent actions with correct badges.
- E2E test: application with no audit records shows empty state message.

---

- [ ] U7. **Backend and E2E tests**

**Goal:** Full test coverage for the audit trail pipeline.

**Requirements:** R1–R7

**Dependencies:** U3, U4, U5, U6

**Files:**
- Modify: `server/test/api.test.js`
- Modify: `client/e2e/` (add or update E2E spec)

**Approach:**
- Backend: add `describe('Agent Action Audit Trail')` with tests covering all scenarios from U3, U4, and U5.
- E2E: add Playwright test that opens an application, triggers document generation via API (or mocks it), and verifies the audit timeline appears in the UI.

**Patterns to follow:**
- Existing `supertest` + `node:test` backend test patterns.
- Existing Playwright E2E patterns in `client/e2e/`.

**Test scenarios:**
- Covers all scenarios listed in U3, U4, U5.
- E2E: audit timeline renders after agent mutation.
- E2E: empty state shown when no agent actions exist.

**Verification:**
- `cd server && npm test` passes.
- `cd client && npm run test:e2e` passes.

---

## System-Wide Impact

- **Interaction graph:** Every mutating MCP tool and REST route now invokes `logAuditEvent`. The audit service is a new leaf dependency — nothing else depends on it.
- **Error propagation:** Audit logging failures are swallowed at the service layer. They cannot propagate to tool handlers, route handlers, or the frontend.
- **State lifecycle risks:** Audit records reference `applications.id` with `ON DELETE CASCADE`, so application deletion automatically cleans up associated audit rows. No orphaned audit records.
- **API surface parity:** MCP mutations are audited; REST mutations are audited; only REST provides a read endpoint for v1.
- **Integration coverage:** Cross-layer scenario: MCP tool creates application → REST `GET /audit-log` returns the create record. Browser user updates status → frontend timeline shows the update. REST API key generates document → frontend timeline shows the agent action.
- **Unchanged invariants:** Existing `[admin]` console logs remain unchanged. Existing application CRUD behavior is unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Audit table grows unbounded | Accept for v1; add retention policy or pruning in follow-up work |
| Monkey-patching `server.tool()` breaks with SDK upgrade | The patch is small and localized; SDK major version upgrades are rare and would be caught by tests |
| Developer forgets to add audit call in new REST route | Code review; the explicit call pattern makes omission visible. A future middleware-based approach could automate this |
| Audit logging adds latency to fast operations | SQLite INSERT is sub-millisecond; fire-and-forget design means no await or network calls |
| Users may find the activity timeline noisy | Collapsible section keeps it out of the way; human vs agent badges provide scannability |

---

## Documentation / Operational Notes

- No new environment variables required.
- No deployment changes; ships in the existing Docker image.
- Consider mentioning the audit trail in the MCP server documentation so users know agent actions are recorded.
- Update `AGENTS.md` if it references the old `agent_actions` name or scope.

---

## Sources & References

- **Origin document:** [docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md](../ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md)
- Related code:
  - `server/mcp.js` — MCP tool registration and handler patterns
  - `server/routes/applications.js` — REST mutation routes and admin logging
  - `server/services/applications.js` — service layer mutations
  - `server/middleware/auth.js` — auth method detection
  - `server/db.js` — table creation and migration patterns
  - `client/src/components/ApplicationPanel.vue` — structured list and collapsible section UI
  - `client/src/api.js` — frontend API client patterns
- Related solutions:
  - `docs/solutions/logic-errors/file-cleanup-ordering-orphaned-uploads-2026-04-23.md` — side effects must not fail the primary operation
