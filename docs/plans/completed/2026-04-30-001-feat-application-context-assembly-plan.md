---
title: Application Context Assembly Endpoint
type: feat
status: completed
date: 2026-04-30
origin: docs/brainstorms/2026-04-30-application-context-assembly-requirements.md
---

# Application Context Assembly Endpoint

## Overview

Add a `GET /api/applications/:id/context` REST endpoint and a `get_application_context` MCP tool that return a single assembled payload containing the application record, stage notes, attachments (with extracted text), user profile, and raw job description. This eliminates the 3–4 round trips agents currently need to build working context.

---

## Problem Frame

MCP agents and external consumers must currently call `GET /api/applications/:id`, `GET /api/applications/:id/notes`, `GET /api/applications/:id/attachments`, and `GET /api/me/profile` separately to assemble context. This is slow, token-expensive, and fragile. A single endpoint/tool bundles everything needed for downstream AI features (document generation, interview prep, tailoring).

(see origin: docs/brainstorms/2026-04-30-application-context-assembly-requirements.md)

---

## Requirements Trace

- R1. `GET /api/applications/:id/context` returns assembled JSON scoped to the authenticated user.
- R2. Payload includes application, notes, attachments (with `extracted_text`), profile, and raw `job_description`.
- R3. Returns 404 for unknown or non-owned applications.
- R4. Admin can read any application's context; accesses are audit-logged.
- R5. MCP tool `get_application_context(application_id)` returns the same payload.
- R6. MCP tool scoped to API key owner.
- R7. Flat response shape with stable top-level keys.
- R8. Attachments include metadata + `extracted_text` only (no binary data).
- R9. Profile includes all fields; nulls preserved as `null` or empty string.
- R10. Raw `job_description` only; structured JD parsing deferred.

**Origin acceptance examples:** AE1 (covers R1, R2, R7), AE2 (covers R4), AE3 (covers R3)

---

## Scope Boundaries

- No structured JD parsing in v1.
- No caching layer; every call hits the database.
- No pagination on notes or attachments.
- No write operations via this endpoint.
- No new frontend UI.

---

## Context & Research

### Relevant Code and Patterns

- `server/routes/applications.js` — existing application CRUD routes, user_email scoping pattern, admin audit-log pattern (`console.info('[admin] ...')`).
- `server/mcp.js` — tool registration pattern with `server.tool(name, description, zodSchema, handler)`. Existing tools (`list_applications`, `get_application`) return single JSON text blocks via `JSON.stringify`.
- `server/middleware/auth.js` — `req.userEmail`, `req.isAdmin`, `req.authMethod` available on all requests.
- `server/test/api.test.js` — `node:test` + supertest. Uses in-memory DB. Existing test suites for Applications, API Key auth, MCP Server, and Profile provide patterns to follow.
- `server/db.js` — `user_profiles` table and `attachments.extracted_text` column already exist.

### Institutional Learnings

- `docs/solutions/` has patterns for SQLite migrations and Express route testing but nothing specific to context assembly.
- The project avoids Vuex/Pinia; this feature is backend-only and does not affect frontend state management.

---

## Key Technical Decisions

- **Single JSON text block for MCP:** Follows existing `list_applications` and `get_application` tool patterns. No multi-part content splitting.
- **Keep `created_at`/`updated_at` in profile response:** Token cost is negligible; agents may benefit from knowing profile freshness.
- **Inline query assembly rather than shared service function:** The logic is simple enough (4 prepared statements + object construction) that a dedicated service module adds indirection without value. If complexity grows, extract later.
- **Mount REST route in `applications.js` router:** `/api/applications/:id/context` naturally belongs alongside existing `/api/applications/:id/*` sub-routes.

---

## Open Questions

### Resolved During Planning

- **MCP content format:** Single JSON text block (follows existing tool pattern).
- **Include `created_at`/`updated_at` in profile:** Yes, keep them.

### Deferred to Implementation

- None.

---

## Implementation Units

- [ ] U1. **REST endpoint: `GET /api/applications/:id/context`**

**Goal:** Add the context assembly REST endpoint to the applications router.

**Requirements:** R1, R2, R3, R4, R7, R8, R9, R10

**Dependencies:** None

**Files:**
- Modify: `server/routes/applications.js`
- Test: `server/test/api.test.js`

**Approach:**
- Add `router.get('/:id/context', ...)` in `server/routes/applications.js`.
- Query the application scoped by `req.userEmail` (or allow admin).
- If not found, return 404.
- Query stage notes (`SELECT * FROM stage_notes WHERE application_id = ?`).
- Query attachments (`SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?`).
- Query user profile (`SELECT * FROM user_profiles WHERE user_email = ?`).
- Assemble flat response object with keys: `application`, `notes`, `attachments`, `profile`, `job_description`.
- If admin and `application.user_email !== req.userEmail`, log audit line.

**Patterns to follow:**
- Existing `GET /api/applications/:id` scoping and 404 handling in `server/routes/applications.js`.
- Existing admin audit-log pattern (`console.info('[admin] ...')`) used in CV/cover-letter download routes.

**Test scenarios:**
- **Happy path:** Given an application with notes, attachments (with extracted_text), and profile, `GET /api/applications/:id/context` returns 200 with all five top-level keys populated.
- **Edge case:** Given an application with no notes, no attachments, and empty profile, returns 200 with empty arrays and null fields.
- **Error path:** Given a non-existent application ID, returns 404.
- **Error path:** Given an application owned by another user (non-admin), returns 404.
- **Integration:** Admin `GET /api/applications/:id/context` for another user's app returns 200 with full payload and emits `[admin]` log line.

**Verification:**
- Endpoint responds correctly via curl/supertest.
- Admin reads emit `[admin]` log line.
- Response shape matches requirements doc.

---

- [ ] U2. **MCP tool: `get_application_context`**

**Goal:** Register the MCP tool so agents can retrieve context in a single call.

**Requirements:** R5, R6, R7, R8, R9, R10

**Dependencies:** U1

**Files:**
- Modify: `server/mcp.js`
- Test: `server/test/api.test.js`

**Approach:**
- Register `get_application_context` in `createMcpServer()` using `server.tool()`.
- Schema: `z.object({ application_id: z.number() })`.
- Resolve `userEmail` from `extra.authInfo?.clientId` (API key owner), same pattern as existing MCP tools.
- Query and assemble payload using the same query pattern as U1.
- Return single JSON text content block via `JSON.stringify`.
- Handle missing application (return `isError: true` with explanatory text).

**Patterns to follow:**
- Existing `get_application` tool in `server/mcp.js` for error handling and response format.
- Existing `list_applications` tool for auth resolution (`extra.authInfo?.clientId`).

**Test scenarios:**
- **Happy path:** Authenticated MCP client calls `get_application_context` with valid `application_id` and receives assembled JSON.
- **Error path:** MCP client calls with non-existent `application_id` and receives `isError: true`.
- **Integration:** Profile and attachment data in MCP response matches the user's actual database records.

**Verification:**
- MCP tool is discoverable via `tools/list` after session initialization.
- Tool returns correct payload shape for the API key's owner.

---

- [ ] U3. **Backend tests and verification**

**Goal:** Ensure both REST endpoint and MCP tool are covered by the test suite.

**Requirements:** All R-IDs

**Dependencies:** U1, U2

**Files:**
- Modify: `server/test/api.test.js`

**Approach:**
- Add a "Context Assembly" subtest suite in `server/test/api.test.js`.
- Reuse existing test helper patterns (create application, add notes, upload attachment, create profile).
- Cover REST endpoint happy path, 404, admin access, and empty-data edge case.
- Cover MCP tool happy path and error path.

**Patterns to follow:**
- Existing "Profile" subtest suite for DB setup and teardown pattern.
- Existing "MCP Server" subtest suite for MCP tool invocation pattern.

**Test scenarios:**
- Covers AE1, AE2, AE3 from origin requirements doc.
- Additional edge case: empty context (no notes, no attachments, empty profile).

**Verification:**
- `cd server && DB_PATH=:memory: npm test` passes with new tests included.

---

## System-Wide Impact

- **Interaction graph:** No callbacks, middleware, or observers affected. New read-only route and tool.
- **Error propagation:** Query failures bubble to Express error handler (REST) or return `isError` (MCP), consistent with existing patterns.
- **State lifecycle risks:** None — read-only endpoint.
- **API surface parity:** New `/api/applications/:id/context` endpoint and `get_application_context` MCP tool. No changes to existing endpoints.
- **Unchanged invariants:** Existing application CRUD, attachment handling, API key management, and MCP tools are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Response payload grows large for applications with many notes/attachments | Accept for v1; pagination or selective fields can be added later if profiling shows it matters. |
| MCP clients cache old tool list | Standard MCP behavior; document that clients need to reconnect to see `get_application_context`. |

---

## Documentation / Operational Notes

- Update `AGENTS.md` if the API conventions or MCP tools sections list endpoints/tools.
- The `get_application_context` MCP tool will be invisible to existing sessions until clients reconnect.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-30-application-context-assembly-requirements.md](../brainstorms/2026-04-30-application-context-assembly-requirements.md)
- Related code: `server/routes/applications.js`, `server/mcp.js`, `server/test/api.test.js`
