---
title: AI Document Generation Pipeline
type: feat
status: complete
date: 2026-05-04
origin: docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md
---

# AI Document Generation Pipeline

## Overview

Add an AI-powered document generation feature that produces tailored cover letters, resume tailoring suggestions, and interview preparation briefs for any job application. The pipeline reads the assembled application context (JD, notes, attachments, user profile), sends it to an LLM with a task-specific prompt, and stores the result as a generated attachment. Users review and manage generated documents alongside their other attachments.

---

## Problem Frame

Agents and users currently have all the pieces needed for document generation — structured JD, user profile, attachment text, stage notes — but no way to turn that into actionable output. Manually writing cover letters for every application is repetitive and error-prone. An integrated generation pipeline turns the tracker from a record-keeping tool into an active job-search assistant.

(see origin: docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md, idea #6)

---

## Requirements Trace

- R1. `POST /api/applications/:id/generate` accepts a `task` enum (`cover_letter`, `resume_tailor`, `interview_prep`) and returns the generated document text.
- R2. Generation reads the existing context assembly payload (application, notes, attachments with extracted text, profile, job description) — no additional database queries required beyond what the context endpoint already does.
- R3. Generated documents are stored as `.md` attachments with `generated_by = 'agent'` and `generation_task = <task>` metadata.
- R4. Generation failures are handled gracefully: no attachment is created, and a descriptive error is returned.
- R5. Admin users can trigger generation for any application; accesses are audit-logged.
- R6. An MCP tool `generate_document` exposes the same capability to API-key-authenticated agents.
- R7. The frontend shows a "Generate" control in the application panel with task-type selection.
- R8. Generated attachments are visually distinguished in the attachment list (badge/icon).
- R9. Users can delete generated attachments the same way they delete uploaded attachments.

---

## Scope Boundaries

- **In scope:** Cover letter generation, resume tailoring suggestions, interview prep briefs, storage as attachments, REST + MCP exposure, frontend generation UI, visual distinction for generated attachments.
- **Not in scope:** In-place editing of generated content (users can copy/paste); automatic regeneration on data change; versioning of generated documents; batch generation across multiple applications; PDF/DOCX export of generated content (plain markdown only in v1).
- **Deferred to follow-up work:** PDF/DOCX export of generated documents; inline editing within the application panel; auto-regenerate when JD or profile changes.

---

## Context & Research

### Relevant Code and Patterns

- **LLM client pattern:** `server/services/extraction.js` already creates an OpenAI client with `getOpenAIClient()`, reads `OPENAI_API_KEY` and `LLM_MODEL` env vars, and uses `response_format: { type: 'json_object' }`. The generation service should reuse the same client but use plain text completion (not JSON mode).
- **Context assembly:** `server/routes/applications.js:90` (`GET /:id/context`) and `server/mcp.js:228` (`get_application_context` tool) both query the same four data sources (application, notes, attachments, profile). The generation route should reuse this logic inline or extract a shared helper.
- **Attachment storage:** `server/routes/applications.js` uses multer for file uploads. Generated documents bypass multer and write directly to `uploadsDir` via `fs.writeFileSync`, then insert into the `attachments` table. The `extracted_text` and `extracted_at` columns were added via `ALTER TABLE` in `server/db.js` — the same migration pattern applies for new columns.
- **Auth / audit logging:** Admin access is logged via `console.info('[admin] %s ...')` — follow the exact pattern used in `extract-jd` and `fetch-jd` routes.
- **Error handling:** Routes use `handleError(res, err)` which converts `ServiceError` to HTTP responses. The generation service should throw `ServiceError` for expected failures (missing API key, empty context) and let unexpected errors bubble.
- **MCP tool registration:** `server/mcp.js` uses `server.tool(name, description, schema, handler)`. The handler receives `args` and `extra` (with `extra.authInfo.clientId` for the user email).
- **Frontend API client:** `client/src/api.js` exports named functions that return `api.post(...).then(r => r.data)`. New functions follow the same pattern.
- **Frontend components:** `ApplicationPanel.vue` is the detail view where fetch/extract buttons live. Attachments are rendered in a list with download and delete actions.

### Institutional Learnings

- `docs/solutions/` contains patterns for attachment migrations and text extraction backfills. No direct learning for generation, but the migration pattern (`PRAGMA table_info` → `ALTER TABLE`) is well-established.

### External References

- OpenAI chat completions API: https://platform.openai.com/docs/api-reference/chat/create (already used for JD extraction)

---

## Key Technical Decisions

- **Reuse OpenAI client from extraction service:** Both features need the same API key, model selection, and client initialization. Rather than duplicating, the generation service imports `getOpenAIClient` from `server/services/extraction.js`. If OpenAI is not configured, generation returns 503.
- **Store generated docs as markdown attachments:** This gives them first-class status in the existing attachment system (download, delete, extracted_text for future use). A `generated_by` column distinguishes them from uploads.
- **Task-specific prompts, not a generic prompt:** Each task type (cover_letter, resume_tailor, interview_prep) has its own system prompt tailored to the output format. This produces higher-quality results than a single generic prompt with conditional logic.
- **Synchronous API call with timeout:** Generation is a single LLM call (~2-4s). Simpler than adding a job queue. If scale becomes an issue, async processing can be added later.
- **No `extracted_text` for generated attachments:** Generated attachments are plain markdown text — the content is already textual. The `extracted_text` column remains null for generated attachments (or could be populated with the same text for consistency; deferred decision).

---

## Open Questions

### Resolved During Planning

- **Should generated documents have `extracted_text` populated?** No — the content is already text. Populating it would be redundant. If future features need it, a backfill is trivial.
- **Should the generation endpoint return the attachment metadata or just the text?** Return both: `{ text, attachment }` so the frontend can immediately render the text and know the attachment ID for deletion.
- **Resume tailor vs. resume rewrite?** "Resume tailor" produces a delta/suggestions document ("Add X, emphasise Y, rephrase Z"), not a full rewritten resume. This is safer and more useful — the user's canonical CV stays in their profile.

### Deferred to Implementation

- **Exact prompt wording:** Prompts will be drafted during implementation and refined with test cases. The plan specifies the information inputs and output format, not the final prose.
- **Max token limit for generation:** Will be set empirically during implementation (likely 2000-4000 tokens depending on task). Documented in the service.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
User clicks "Generate Cover Letter"
  → Frontend POST /api/applications/:id/generate { task: "cover_letter" }
    → Route: ownership check → build context payload
      → Service: construct prompt (context + task instructions)
        → OpenAI chat.completions.create
          → Service: write .md file to uploadsDir
            → Insert attachment row (generated_by='agent', generation_task='cover_letter')
              → Return { text, attachment }
                → Frontend: show generated text in panel, add to attachment list
```

---

## Implementation Units

- [ ] U1. **Attachment schema migration — add generation metadata columns**

**Goal:** Distinguish generated attachments from uploaded ones.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Modify: `server/db.js`

**Approach:**
- In the existing attachment column migration block (after `extracted_at`), check for `generated_by` and `generation_task` columns via `PRAGMA table_info`.
- Add both columns as `TEXT` with `DEFAULT NULL`.

**Patterns to follow:**
- Mirror the `extracted_text` / `extracted_at` migration pattern in `server/db.js:113-119`.

**Test scenarios:**
- Test expectation: none — schema migration verified by subsequent units.

**Verification:**
- `PRAGMA table_info(attachments)` shows `generated_by` and `generation_task` columns.

---

- [ ] U2. **Document generation service**

**Goal:** Core orchestration: assemble context, call LLM, return generated text.

**Requirements:** R1, R2, R4

**Dependencies:** U1

**Files:**
- Create: `server/services/generation.js`
- Modify: `server/services/extraction.js` (export `getOpenAIClient` if not already exported)

**Approach:**
- Import `getOpenAIClient` from `./extraction`.
- Define three task-specific system prompts (cover_letter, resume_tailor, interview_prep). Each prompt instructs the model on output format and tone.
- `async function generateDocument(context, task)`:
  - Validate `task` is one of the three allowed values.
  - Check OpenAI client is available; throw `ServiceError(503, ...)` if not.
  - Build a user message containing the flattened context (application details, JD, profile fields, attachment texts, notes).
  - Call `client.chat.completions.create` with the task-specific system prompt, user message, and a reasonable `max_tokens`.
  - Return the generated text string.
- Wrap unexpected OpenAI errors in a descriptive message.

**Patterns to follow:**
- `ServiceError` usage from `server/services/applications.js`.
- Logging pattern: `console.log('[generation] start task=...')` and `console.log('[generation] success ...')`.

**Test scenarios:**
- Happy path: valid context + `cover_letter` → returns a non-empty string.
- Edge case: empty profile / no notes → still generates (LLM handles sparse context).
- Error path: missing `OPENAI_API_KEY` → throws ServiceError with status 503.
- Error path: OpenAI API error (rate limit, timeout) → throws ServiceError with status 502.
- Error path: invalid task type → throws ServiceError with status 400.

**Verification:**
- The service can be imported and called with mock context in tests.
- All test scenarios pass.

---

- [ ] U3. **REST endpoint for generation**

**Goal:** Expose document generation via HTTP.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U2

**Files:**
- Modify: `server/routes/applications.js`
- Test: `server/test/api.test.js`

**Approach:**
- `POST /api/applications/:id/generate`
- Ownership check (owner or admin, same pattern as `extract-jd`).
- Audit-log admin access.
- Build context payload inline (same queries as the `/context` route).
- Call `generateDocument(context, req.body.task)`.
- On success: generate a filename like `<task>_<timestamp>_<random>.md`, write to `uploadsDir`, insert attachment row with `generated_by = 'agent'` and `generation_task = req.body.task`.
- Return `{ text: generatedText, attachment: { id, original_filename, file_size, mime_type, generated_by, generation_task } }`.
- On failure: do not create an attachment; return the error via `handleError`.

**Patterns to follow:**
- Route structure mirrors `POST /:id/extract-jd` (lines 397-423).
- Context assembly mirrors `GET /:id/context` (lines 90-113).
- Attachment insert mirrors the multer success path.

**Test scenarios:**
- Happy path: authenticated user generates cover letter → 200 with `text` and `attachment`.
- Happy path: generated attachment appears in subsequent `GET /api/applications/:id` response.
- Edge case: admin generates for another user's app → 200, audit log emitted.
- Error path: unknown application → 404.
- Error path: missing/invalid task → 400.
- Error path: application with empty job_description and empty profile → still returns 200 (LLM works with sparse context).
- Integration: deleting the application cascades and deletes the generated attachment file.

**Verification:**
- Backend tests for the new endpoint pass.
- Manually verifying the endpoint with curl returns expected shape.

---

- [ ] U4. **MCP tool for generation**

**Goal:** Allow API-key-authenticated agents to generate documents.

**Requirements:** R6

**Dependencies:** U2

**Files:**
- Modify: `server/mcp.js`
- Test: `server/test/api.test.js`

**Approach:**
- Register `generate_document` tool with schema: `application_id` (int), `task` (enum).
- Reuse the same `generateDocument` service function.
- Build context from the database (same queries as `get_application_context` tool).
- Write the generated file and insert the attachment row.
- Return `{ content: [{ type: 'text', text: generatedText }], attachmentMetadata: { ... } }`.
- Use `toolError` for error handling.

**Patterns to follow:**
- Tool registration mirrors `get_application_context` (lines 228-255).
- Auth check mirrors other MCP tools (`extra.authInfo?.clientId`).

**Test scenarios:**
- Happy path: MCP tool `generate_document` with valid app ID and task → returns generated text.
- Error path: unknown application_id → returns MCP error.
- Error path: invalid task → returns MCP error.
- Integration: generated attachment is visible via `get_application` MCP tool afterward.

**Verification:**
- MCP tests in `server/test/api.test.js` pass.

---

- [ ] U5. **Frontend API client and UI for generation**

**Goal:** Users can generate documents from the application panel.

**Requirements:** R7, R8

**Dependencies:** U3

**Files:**
- Modify: `client/src/api.js`
- Modify: `client/src/components/ApplicationPanel.vue`

**Approach:**
- Add `generateDocument(appId, task)` to `client/src/api.js`.
- In `ApplicationPanel.vue`, add a "Generate" section with:
  - A dropdown or button group for task type: Cover Letter, Resume Tips, Interview Prep.
  - A "Generate" button that calls the API and shows a loading state.
  - On success: display the generated text in a collapsible/read-only panel (reuse the existing markdown rendering pattern from notes/JD display).
  - The generated attachment automatically appears in the existing attachment list.
- Visual distinction: in the attachment list, show a small badge (e.g., "AI") next to attachments where `generated_by === 'agent'`. Use the existing stage-colour system or a subtle accent badge.

**Patterns to follow:**
- API client follows existing named-export pattern (`export function generateDocument(...)`).
- Loading state follows existing patterns (button disabled, spinner or "Generating..." text).
- Markdown rendering uses the same `marked` + `dompurify` pipeline as notes.
- The attachment list rendering is already in `ApplicationPanel.vue`; add a conditional badge.

**Test scenarios:**
- Test expectation: none for pure UI changes — E2E tests cover interaction.

**Verification:**
- E2E test: user opens an application, selects "Cover Letter", clicks Generate, sees generated text.
- E2E test: generated attachment appears in the attachment list with an AI badge.
- E2E test: user can delete a generated attachment.

---

- [ ] U6. **Backend and E2E tests**

**Goal:** Full test coverage for the generation pipeline.

**Requirements:** R1-R9

**Dependencies:** U3, U4, U5

**Files:**
- Modify: `server/test/api.test.js`
- Modify: `client/e2e/` (add or update E2E spec)

**Approach:**
- Backend tests mock the OpenAI client by temporarily replacing `getOpenAIClient` or by mocking the module. If mocking is complex, use a test helper that injects a stub client.
- Add a `describe('Document Generation')` block with tests covering all scenarios from U3 and U4.
- E2E tests use Playwright to interact with the generation UI. Mock the API response or use a test account with a stubbed OpenAI key.

**Patterns to follow:**
- Backend tests use the existing `supertest` + `node:test` pattern.
- E2E tests follow the existing Playwright patterns in `client/e2e/`.

**Test scenarios:**
- Covers all scenarios listed in U3 and U4.
- E2E: user generates a document for an application and sees it in the UI.
- E2E: attachment list distinguishes generated from uploaded attachments.

**Verification:**
- `cd server && npm test` passes.
- `cd client && npm run test:e2e` passes.

---

## System-Wide Impact

- **Interaction graph:** The generation route touches `applications`, `attachments`, `stage_notes`, `user_profiles`. It does not modify applications, notes, or profiles — only reads them.
- **Error propagation:** Generation failures (LLM unavailable, rate limit) are caught at the route level and returned as 502/503. No partial writes occur — the file is written and the DB insert happens in the same success branch.
- **State lifecycle risks:** If the file write succeeds but the DB insert fails (extremely unlikely with SQLite), an orphaned file may exist. This is consistent with existing upload behavior and acceptable for v1.
- **API surface parity:** The REST endpoint and MCP tool expose the same generation capability. Both create attachments with identical metadata.
- **Integration coverage:** Cross-layer scenarios include: MCP tool generates → REST list shows new attachment; REST generates → MCP `get_application` includes new attachment.
- **Unchanged invariants:** Existing attachment endpoints (download, delete, extracted-text) work identically for generated and uploaded attachments. The `generated_by` and `generation_task` columns are read-only after creation.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| LLM provider unavailable | Return 503; generation is an optional enhancement, not a core flow blocker. |
| Cost surprises at scale | Use `gpt-4o-mini` (same as JD extraction); monitor via logs. Add rate limiting if needed. |
| Prompt quality varies by task | Ship with v1 prompts; refine based on user feedback in follow-up. |
| Generated content quality is poor | Clear scope: v1 is a drafting assistant, not a final-copy guarantee. Users review before use. |
| Attachment list becomes cluttered with generated docs | Users can delete generated attachments; future work may add grouping/filtering. |

---

## Documentation / Operational Notes

- Add `OPENAI_API_KEY` and `LLM_MODEL` to `.env.example` if not already present (they should be from JD extraction).
- No additional env vars required for v1.
- No deployment changes; the feature ships in the existing Docker image.

---

## Sources & References

- **Origin document:** [docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md](../ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md)
- Related code:
  - `server/services/extraction.js` — OpenAI client and prompt patterns
  - `server/routes/applications.js` — context assembly, extract-jd, fetch-jd routes
  - `server/mcp.js` — MCP tool registration patterns
  - `client/src/api.js` — frontend API client patterns
  - `client/src/components/ApplicationPanel.vue` — application detail UI
- Related plans:
  - `docs/plans/2026-04-30-001-feat-application-context-assembly-plan.md`
  - `docs/plans/2026-04-30-001-feat-user-profile-store-plan.md`
  - `docs/plans/2026-05-01-001-feat-structured-jd-extraction-plan.md`
