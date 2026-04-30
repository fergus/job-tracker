---
title: User Profile / Master Resume Store
type: feat
status: active
date: 2026-04-30
origin: docs/brainstorms/2026-04-30-user-profile-master-resume-requirements.md
---

# User Profile / Master Resume Store

## Overview

Add a per-user profile that stores candidate identity, career narrative, and agent instructions. This gives MCP agents the "candidate side" context they need to generate tailored documents and useful advice. The profile is editable via the existing Settings panel and readable by agents via a new MCP tool.

---

## Problem Frame

Agents currently only know the user's email address. Without candidate context, every agent interaction is generic. A user profile provides the canonical resume, career narrative, and agent tuning instructions that make downstream AI features (document generation, tailoring, interview prep) actually useful.

(see origin: docs/brainstorms/2026-04-30-user-profile-master-resume-requirements.md)

---

## Requirements Trace

- R1. User can view and edit their profile in the web UI
- R2. Profile persists across sessions
- R3. Admin can read any profile (audit-logged)
- R4. MCP agent can retrieve profile via `get_user_profile`
- R5. Empty profile auto-created on first user visit
- R6. One profile per user for v1

---

## Scope Boundaries

- **Not in scope:** Multi-profile support (e.g., separate "Staff Eng" vs "EM" profiles) — noted as future extension
- **Not in scope:** Structured skills extraction or proof-points table — skills live in markdown CV/narrative for v1
- **Not in scope:** Admin list/view UI for browsing all profiles — admin access is via REST API only for v1
- **Not in scope:** Profile update via MCP — agents can read but not write profiles in v1
- **Not in scope:** Timezone field — dropped per requirements

### Deferred to Follow-Up Work

- Onboarding flow to guide users through profile creation and agent instruction tuning
- Multi-profile support with archetype-specific narratives
- Structured proof-points table with hero metrics

---

## Context & Research

### Relevant Code and Patterns

- `server/db.js` — table creation, column migrations, `_migrations` tracking. Follows `CREATE TABLE IF NOT EXISTS` + `PRAGMA table_info` guard pattern.
- `server/middleware/auth.js` — `cachedUpsertUser` already creates `users` rows on first visit with `ON CONFLICT(email) DO UPDATE`. Same pattern applies for profile auto-creation.
- `server/routes/keys.js` — OAuth-only routes using `requireOAuth` middleware pattern.
- `server/mcp.js` — tool registration pattern with `server.tool(name, description, zodSchema, handler)`. Auth via `extra.authInfo?.clientId`.
- `client/src/api.js` — named exports, axios wrapper at `/api` baseURL.
- `client/src/components/SettingsPanel.vue` — slide-over panel pattern with sections, form inputs, and API integration.
- `server/test/api.test.js` — `node:test` + supertest. Uses in-memory DB (`DB_PATH=:memory:`).

### Institutional Learnings

- `docs/solutions/` has patterns for SQLite migrations and Express route testing but nothing specific to user profiles.
- The project avoids Vuex/Pinia; state is local to components or passed via props/events from `App.vue`.

---

## Key Technical Decisions

- **Table name:** `user_profiles` — does not conflict with existing `users` table, clearly scoped.
- **Auto-creation:** Extend `cachedUpsertUser` in auth middleware to also `INSERT OR IGNORE INTO user_profiles (user_email) VALUES (?)`. This guarantees every authenticated user has a profile row without changing any call sites.
- **Admin endpoint:** `GET /api/users/:email/profile` — restricted to `req.isAdmin`, audit-logged via `console.info('[admin] ...')`. Keeps the `/api/me/*` namespace clean for owner-only operations.
- **OAuth-only for writes:** `PUT /api/me/profile` requires `req.authMethod === 'oauth'`, same as key management. Agents read via MCP; they do not write profiles in v1.
- **Profile storage:** Single row per user, all fields on one table. No separate tables for v1 — schema is simple enough that normalization adds no value.

---

## Open Questions

### Resolved During Planning

- **Admin endpoint shape:** `GET /api/users/:email/profile` rather than query param on `/api/me/profile`. Cleaner separation of owner vs admin paths.
- **Write auth:** OAuth-only for PUT. API keys cannot update profiles — prevents accidental or malicious agent mutation of candidate identity.

### Deferred to Implementation

- Exact validation rules for URL fields (reuse `isValidUrl` from `services/applications.js` or inline?)
- Whether to trim/normalize `agent_emphasize` and `agent_avoid` comma-separated values on save

---

## Implementation Units

- [ ] U1. **Database schema and auto-creation hook**

**Goal:** Create the `user_profiles` table and ensure every user gets an empty profile on first authentication.

**Requirements:** R5, R6

**Dependencies:** None

**Files:**
- Modify: `server/db.js`
- Modify: `server/middleware/auth.js`
- Test: `server/test/api.test.js`

**Approach:**
- Add `CREATE TABLE IF NOT EXISTS user_profiles` in `server/db.js` with all structured and markdown fields.
- In `server/middleware/auth.js`, after `cachedUpsertUser(email)`, run `db.prepare("INSERT OR IGNORE INTO user_profiles (user_email) VALUES (?)").run(email)`.
- This runs inside the same cached window (60s) as user upsert, so the extra write is cheap.

**Patterns to follow:**
- Existing `users` table creation pattern in `server/db.js`
- Existing `cachedUpsertUser` caching pattern in `server/middleware/auth.js`

**Test scenarios:**
- Happy path: First request from new user creates both `users` row and `user_profiles` row
- Happy path: Subsequent requests from same user within 60s do not cause duplicate profile rows
- Edge case: Profile row already exists (manual DB insertion) — `INSERT OR IGNORE` handles gracefully

**Verification:**
- `SELECT * FROM user_profiles WHERE user_email = 'new@example.com'` returns a row after first authenticated request
- No duplicate rows after repeated requests

---

- [ ] U2. **REST API endpoints**

**Goal:** Add `GET /api/me/profile`, `PUT /api/me/profile`, and admin `GET /api/users/:email/profile`.

**Requirements:** R1, R2, R3

**Dependencies:** U1

**Files:**
- Create: `server/routes/profile.js`
- Modify: `server/app.js`
- Test: `server/test/api.test.js`

**Approach:**
- Create `server/routes/profile.js` with three routes.
- `GET /me/profile`: returns profile for `req.userEmail`. Returns empty profile if auto-creation worked correctly.
- `PUT /me/profile`: requires OAuth, updates allowed fields. Rejects unknown fields. Returns updated profile.
- `GET /users/:email/profile`: requires `req.isAdmin`, returns that user's profile, audit-logged.
- Mount router in `server/app.js` with `app.use('/api', profileRouter)`.

**Patterns to follow:**
- `server/routes/keys.js` for OAuth-only middleware pattern
- `server/routes/applications.js` for ServiceError handling and validation

**Test scenarios:**
- Happy path: `GET /api/me/profile` returns profile with all fields for authenticated user
- Happy path: `PUT /api/me/profile` updates allowed fields and returns updated profile
- Error path: `PUT /api/me/profile` with unknown field returns 400
- Error path: `PUT /api/me/profile` via API key auth returns 403
- Happy path: Admin `GET /api/users/:email/profile` returns another user's profile
- Error path: Non-admin `GET /api/users/:email/profile` returns 403
- Error path: `GET /api/users/:email/profile` for non-existent user returns 404

**Verification:**
- All three endpoints respond correctly via curl/supertest
- Admin reads emit `[admin]` log line

---

- [ ] U3. **MCP tool: get_user_profile**

**Goal:** Add `get_user_profile` tool to the MCP server so agents can retrieve candidate context.

**Requirements:** R4

**Dependencies:** U1, U2

**Files:**
- Modify: `server/mcp.js`
- Test: `server/test/api.test.js`

**Approach:**
- Register `get_user_profile` tool in `createMcpServer()` with no arguments (profile is scoped to the authenticated user).
- Query `db.prepare('SELECT * FROM user_profiles WHERE user_email = ?')` using the API key's resolved email.
- Return profile fields as JSON text content.
- Handle missing profile gracefully (should never happen due to auto-creation, but return empty object just in case).

**Patterns to follow:**
- Existing `list_applications` and `get_application` tool patterns in `server/mcp.js`

**Test scenarios:**
- Happy path: Authenticated MCP client calls `get_user_profile` and receives profile JSON
- Integration: Profile returned matches the user's actual profile data in the database

**Verification:**
- MCP tool is discoverable via `tools/list` after session initialization
- Tool returns correct profile data for the API key's owner

---

- [ ] U4. **Frontend API client**

**Goal:** Add profile fetch and update methods to the frontend API client.

**Requirements:** R1

**Dependencies:** U2

**Files:**
- Modify: `client/src/api.js`

**Approach:**
- Add `fetchProfile()` → `GET /me/profile`
- Add `updateProfile(data)` → `PUT /me/profile`

**Patterns to follow:**
- Existing named export pattern in `client/src/api.js`

**Test scenarios:**
- None — pure API client wrapper, covered by integration in U5

**Verification:**
- Methods are importable and callable from Vue components

---

- [ ] U5. **Frontend UI: Profile section in Settings panel**

**Goal:** Add a profile editing form to the existing SettingsPanel component.

**Requirements:** R1

**Dependencies:** U4

**Files:**
- Modify: `client/src/components/SettingsPanel.vue`
- Modify: `client/src/api.js` (if not done in U4)

**Approach:**
- Add a new "Profile" section in SettingsPanel, below the API Keys section.
- Structured fields use standard `<input>` elements.
- Markdown fields (CV, narrative, agent instructions) use `<textarea>` with reasonable heights (CV gets the largest).
- Load profile on panel mount; save on blur or explicit "Save" button.
- Show save success/error state.
- Agent instruction tags (tone, emphasize, avoid) get dedicated small inputs with helper text.

**Patterns to follow:**
- Existing SettingsPanel section structure (section heading + form elements)
- Existing API loading/error state patterns (`loadKeys`, `generateError`)

**Test scenarios:**
- Happy path: Profile loads and displays correctly when settings panel opens
- Happy path: Editing a field and saving updates the profile
- Edge case: Server returns 400 for invalid field — error message displayed

**Verification:**
- Profile section renders correctly in Settings panel
- Changes persist after page refresh
- Validation errors are surfaced to the user

---

## System-Wide Impact

- **Interaction graph:** Auth middleware gains a side effect (profile row creation). No callbacks or observers affected.
- **Error propagation:** Profile creation failure in auth middleware should be non-blocking — log and continue, do not fail the request. The profile can be lazily created later.
- **State lifecycle risks:** `INSERT OR IGNORE` prevents duplicates. No cleanup needed — profiles are small text rows.
- **API surface parity:** New `/api/me/profile` and `/api/users/:email/profile` endpoints. No changes to existing endpoints.
- **Unchanged invariants:** Existing application CRUD, attachment handling, API key management, and MCP tools are untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Auth middleware profile creation fails silently | Log error, do not fail request. Profile can be created lazily on first profile read. |
| Settings panel becomes too long | Profile section is collapsible or well-spaced. Consider tabs if panel grows beyond 3 sections in future. |
| MCP clients cache old tool list | Document that clients need to reconnect to see `get_user_profile`. This is standard MCP behavior. |

---

## Documentation / Operational Notes

- Update `AGENTS.md` if the database schema or API conventions section mentions tables/endpoints
- The `get_user_profile` MCP tool will be invisible to existing sessions until clients reconnect

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-30-user-profile-master-resume-requirements.md](../brainstorms/2026-04-30-user-profile-master-resume-requirements.md)
- Related code: `server/middleware/auth.js`, `server/db.js`, `server/mcp.js`, `client/src/components/SettingsPanel.vue`
