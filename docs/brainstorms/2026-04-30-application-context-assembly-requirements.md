---
date: 2026-04-30
topic: application-context-assembly
scope: standard
---

# Application Context Assembly Endpoint

## Problem Frame

MCP agents and external consumers currently need 3–4 round trips to assemble working context for an application: fetch the application record, fetch stage notes, fetch attachments (with extracted text), and fetch the user profile. This is slow, token-expensive, and error-prone. A single endpoint that bundles everything an agent needs reduces integration friction and unlocks higher-quality downstream features like document generation and interview prep.

---

## Requirements

**REST API**

- R1. `GET /api/applications/:id/context` returns a single JSON payload scoped to the authenticated user.
- R2. The payload includes the full application record, all stage notes, all attachments with `extracted_text`, and the user's profile.
- R3. The endpoint returns 404 if the application does not exist or is owned by another user (same scoping as `GET /api/applications/:id`).
- R4. Admin users can read any application's context; accesses are audit-logged via `console.info('[admin] ...')`.

**MCP Tool**

- R5. Register `get_application_context` as an MCP tool that accepts `application_id` (integer) and returns the same assembled payload as the REST endpoint.
- R6. The MCP tool is scoped to the API key's owner; it cannot access other users' applications.

**Response Shape**

- R7. The response is a flat JSON object with stable top-level keys: `application`, `notes`, `attachments`, `profile`, `job_description`.
- R8. `attachments` includes only metadata + `extracted_text`; file binary data is not included.
- R9. `profile` includes all fields from `user_profiles`; missing/null fields are included as `null` or empty string (no omission).
- R10. `job_description` is the raw text from the application record; structured JD parsing is deferred to a future feature.

---

## Acceptance Examples

- AE1. **Covers R1, R2, R7.** Given an application with 2 notes, 1 attachment (extracted text = "Hello"), and a profile where `full_name = "Alice"`, when `GET /api/applications/42/context` is called, the response contains all four objects under their top-level keys.
- AE2. **Covers R4.** Given an admin user and an application owned by `other@example.com`, when the admin calls `GET /api/applications/42/context`, it returns 200 with the full payload and logs `[admin] admin@example.com accessed context for app 42 owned by other@example.com`.
- AE3. **Covers R3.** Given a non-existent application ID, when `GET /api/applications/999/context` is called, it returns 404.

---

## Success Criteria

- An MCP agent can retrieve complete working context for an application in a single tool call.
- The REST endpoint response shape is stable enough that external consumers can rely on key names.
- All existing auth and scoping invariants are preserved (no admin escalation, no cross-user leakage).

---

## Scope Boundaries

- No structured JD parsing in v1 — `job_description` is raw text only.
- No caching layer in v1 — every call hits the database.
- No pagination on notes or attachments in v1 — the full list is returned.
- No write operations via this endpoint — read-only assembly.
- No new frontend UI — this is an API-only feature.

---

## Key Decisions

- **Both REST + MCP:** The primary consumer is MCP agents, but a REST endpoint is useful for external integrations and manual debugging. Both expose identical payload shapes.
- **Flat response shape:** A flat object (`{ application, notes, ... }`) is easier for agents to consume than a nested graph. Keys are descriptive and stable.

---

## Dependencies / Assumptions

- `user_profiles` table exists and is auto-created for all users (true as of recent commits).
- `attachments.extracted_text` column is populated (true for new uploads; backfill migration already ran).
- MCP server auth already resolves API keys to user emails (true — reuses same `authMiddleware` logic).

---

## Outstanding Questions

### Deferred to Planning

- [Affects R5][Technical] Should the MCP tool return the payload as a single JSON text block or split into multiple content parts?
- [Affects R7][Technical] Should `created_at` / `updated_at` fields be included in the profile object or stripped to reduce token usage?

---

## Next Steps

-> /ce-plan for structured implementation planning
