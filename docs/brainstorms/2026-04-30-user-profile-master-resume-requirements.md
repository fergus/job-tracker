---
date: 2026-04-30
topic: user-profile-master-resume
scope: standard
status: requirements-captured
---

# User Profile / Master Resume Store — Requirements

## Problem Frame

Agents need to know who the candidate is to generate tailored documents (cover letters, resume variants) and provide useful advice. Currently the only user data is an email address. Without a user profile, every agent interaction is generic and context-poor.

## Profile Structure

### Structured Fields (form UI, validated)

| Field | Type | Notes |
|-------|------|-------|
| `full_name` | TEXT | |
| `location_city` | TEXT | |
| `location_country` | TEXT | |
| `target_roles` | TEXT | Comma-separated or JSON array of target titles |
| `compensation_currency` | TEXT | e.g. USD, EUR |
| `compensation_target_range` | TEXT | e.g. "$150K-200K" |
| `linkedin_url` | TEXT | Validated as http/https URL |
| `portfolio_url` | TEXT | Validated as http/https URL |
| `agent_tone` | TEXT | Structured tag: formal / conversational / direct |
| `agent_emphasize` | TEXT | Structured tag: comma-separated topics to highlight |
| `agent_avoid` | TEXT | Structured tag: comma-separated phrases/words to avoid |

### Markdown Fields (textarea, free-form)

| Field | Type | Notes |
|-------|------|-------|
| `cv_markdown` | TEXT | Full canonical resume in markdown |
| `career_narrative` | TEXT | "Who I am" story, exit narrative, superpowers |
| `agent_instructions` | TEXT | Free-text override for agent behavior |

### Derived / Future Fields (not in v1)

- `skills` — moved to markdown (CV or career narrative)
- `timezone` — dropped from v1
- `proof_points` — deferred; may be added as a separate table later
- `profile archetypes` — deferred to multi-profile future extension

## Admin Data Scope

- Admin users can **read** any user's profile, same as applications today.
- Admin **cannot** create, update, or delete profiles (read-only).
- Admin reads are **audit-logged** via `console.info('[admin] ...')`.
- Profile data is scoped per-user via `user_email` — same pattern as applications.

## Cardinality

- **One profile per user** for v1.
- Multi-profile support (e.g., "Staff Engineer" vs "Engineering Manager" narratives) is a known future extension. Schema should not actively prevent it, but v1 does not build UI or API for multiple profiles.

## Auto-Creation Behavior

- When a user first visits the app (i.e., `users` row is created), an **empty profile row** is auto-created with defaults.
- Empty fields are null/empty string — no placeholder content.
- Users edit their profile via a Settings slide-over (same pattern as API key settings).

## Agent Integration

- MCP tool: `get_user_profile` returns the full profile (structured + markdown fields).
- REST endpoint: `GET /api/me/profile` returns the profile.
- REST endpoint: `PUT /api/me/profile` updates the profile.
- Profile is included in the future Context Assembly Endpoint as the "candidate side" of the context.

## Future: Onboarding Feature

- A future onboarding flow may guide users through populating their profile and tuning agent instructions interactively.
- v1 schema and API should support this without migration.

## Success Criteria

- [ ] User can view and edit their profile in the web UI
- [ ] Profile persists across sessions
- [ ] Admin can read any profile (audit-logged)
- [ ] MCP agent can retrieve profile via `get_user_profile`
- [ ] Empty profile auto-created on first user visit
