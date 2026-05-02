---
date: 2026-05-01
topic: structured-jd-extraction
scope: standard
status: complete
---

# Plan: Structured JD Extraction + URL Auto-Import

## Problem Frame

The `job_description` field in applications is an unstructured text blob. Agents and downstream features (document generation, interview prep, skill-gap analysis) cannot reliably extract signal from it. A one-time structured extraction makes every downstream feature higher quality. URL auto-import reduces friction at the capture point by fetching and extracting JDs automatically from `job_posting_url`.

---

## Requirements

### Core Extraction

- R1. `POST /api/applications/:id/extract-jd` triggers structured extraction from the existing `job_description` text.
- R2. Extracted data is stored in a new `applications.extracted_jd` JSON column (nullable, defaults to null).
- R3. The extraction populates at minimum these fields:
  - `required_skills` — array of strings
  - `responsibilities` — array of strings
  - `experience_requirements` — array of strings
  - `salary_signals` — object with `min`, `max`, `currency`, `period` (all optional)
  - `location` — string or null
  - `employment_type` — string or null (e.g. "Full-time", "Contract")
  - `seniority_level` — string or null
- R4. Extraction failures are handled gracefully: `extracted_jd` remains null, and the error is logged. No user-facing error blocks the application flow.
- R5. Extraction can be re-triggered at any time (idempotent overwrite).
- R6. Admin users can trigger extraction for any application; accesses are audit-logged.

### URL Auto-Import

- R7. `POST /api/applications/:id/fetch-jd` fetches HTML from `job_posting_url`, extracts the main job description text, and updates `job_description`.
- R8. After a successful fetch, structured extraction (R1-R3) is automatically triggered so `extracted_jd` is populated in one call.
- R9. Fetch failures (network, 404, anti-bot) are handled gracefully: `job_description` is not modified, and a descriptive error is returned.
- R10. URL fetching respects a 10-second timeout and follows up to 3 redirects.
- R11. Fetched content is sanitized (strip scripts, limit to reasonable text length) before storage.

### MCP Integration

- R12. Register `extract_job_description` as an MCP tool that accepts `application_id` and returns the structured `extracted_jd` JSON.
- R13. Register `fetch_job_description` as an MCP tool that accepts `application_id`, performs URL fetch + extraction, and returns the updated `job_description` and `extracted_jd`.

### Frontend

- R14. A "Fetch & Extract" button appears in the application panel when `job_posting_url` is present. Clicking it triggers R7-R8 and shows a loading state.
- R15. Structured JD data is displayed in a collapsed section inside the application panel (expandable, read-only for v1).
- R16. A "Re-extract" button allows re-running extraction on existing `job_description` text.
- R17. **Fetch failure fallback:** If URL fetch fails (anti-bot, timeout, network error), the UI must not leave the user blocked. See "Fetch Failure Fallback UI" below.

---

## Approach Comparison: LLM vs Rule-Based Extraction

### Option A: LLM-Based Extraction

**How it works**
Send the raw `job_description` text to an LLM API (e.g. OpenAI GPT-4o-mini, Anthropic Claude Haiku, or local Ollama) with a structured-output schema (JSON mode / function calling). The LLM returns populated JSON matching R3's fields.

**Pros**
- High accuracy across wildly different JD formats (startup blurbs, corporate templates, bullet lists, paragraphs).
- Easy to extend fields later — just update the prompt schema.
- Minimal code — ~50 lines of prompt + API call handling.
- Can extract implicit signals (e.g. inferring "seniority_level" from phrases like "staff-level").

**Cons**
- Adds an external API dependency and ongoing cost per extraction.
- Requires an API key and provider selection (new env vars: `LLM_PROVIDER`, `LLM_API_KEY`).
- Latency: 1-3 seconds per call, depending on provider and JD length.
- Privacy: JD text leaves the server.
- Error modes are opaque (hallucination, schema drift).

**Cost Estimate**
- Average JD: ~2K tokens input, ~500 tokens output.
- GPT-4o-mini: ~$0.003 per extraction.
- Claude 3 Haiku: ~$0.0025 per extraction.
- At 100 applications/month: $0.25-0.30/month.

**Implementation Sketch**
```javascript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'system', content: extractionPrompt },
    { role: 'user', content: jobDescription }
  ],
  response_format: { type: 'json_object' },
  temperature: 0.1
})
const extracted = JSON.parse(response.choices[0].message.content)
// Validate against zod schema, store in extracted_jd
```

### Option B: Rule-Based / Heuristic Extraction

**How it works**
Parse `job_description` with a pipeline of regexes, keyword matching, and heuristics. No external API calls.

**Pros**
- Zero external dependencies, zero cost, zero latency.
- Fully offline — works in air-gapped deployments.
- Deterministic and auditable — same input always produces same output.
- No privacy concerns.

**Cons**
- Lower accuracy on non-standard JD formats.
- Requires significant engineering to handle edge cases (tables, mixed languages, creative formatting).
- Harder to extend — adding a new field means writing new heuristics.
- ~300-500 lines of parsing code vs ~50 for LLM.
- Salary extraction in particular is fragile ("competitive", "DOE", ranges in prose).

**Implementation Sketch**
```javascript
function extractStructuredJD(text) {
  const requiredSkills = extractBulletList(text, /requirements|qualifications|skills/i)
  const responsibilities = extractBulletList(text, /responsibilities|what you'll do/i)
  const salary = extractSalary(text) // regex for $X-Y, £X, etc.
  const location = extractLocation(text) // regex for "Remote", "San Francisco", etc.
  // ... etc
  return { requiredSkills, responsibilities, salary, location, ... }
}
```

### Recommendation

**Use LLM-based extraction as the default, with a lightweight fallback.**

Rationale:
- The project already has a production MCP server and API key infrastructure — adding one more external integration is not a dramatic shift.
- The cost is negligible at current scale ($0.25/month for 100 JDs).
- Accuracy matters more than cost for this feature — a poor extraction is worse than no extraction.
- A rule-based fallback can be added later for offline deployments or if the LLM provider is unavailable.

For v1, implement **LLM-only** to keep scope tight. Document the fallback path in the plan for v1.1.

### LLM Provider Selection

**Recommended: OpenAI GPT-4o-mini**
- Cheapest reliable model with JSON mode support.
- Fast enough for synchronous API calls (~1s).
- Well-documented structured output.

**Alternative: Anthropic Claude 3 Haiku**
- Slightly better at following long instructions.
- More expensive than 4o-mini.
- JSON mode via function calling is slightly more verbose.

**Local/Ollama fallback (v1.1)**
- For air-gapped deployments, document how to point to a local Ollama instance.
- Requires running `llama3.1` or similar locally.

---

## Data Model

### Migration: Add `extracted_jd` column

```sql
ALTER TABLE applications ADD COLUMN extracted_jd TEXT;
-- Store as JSON text; SQLite has no native JSON type
```

No backfill migration required — `extracted_jd` is null until explicitly triggered.

### Schema (Zod)

```javascript
const ExtractedJDSchema = z.object({
  required_skills: z.array(z.string()).default([]),
  responsibilities: z.array(z.string()).default([]),
  experience_requirements: z.array(z.string()).default([]),
  salary_signals: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    currency: z.string().optional(),
    period: z.string().optional() // "year", "month", "hour"
  }).optional(),
  location: z.string().optional(),
  employment_type: z.string().optional(),
  seniority_level: z.string().optional()
})
```

---

## API Design

### `POST /api/applications/:id/extract-jd`

Request: none (uses existing `job_description`)

Response 200:
```json
{
  "extracted_jd": {
    "required_skills": ["Python", "AWS", "Kubernetes"],
    "responsibilities": ["Build scalable services", "Mentor junior engineers"],
    "experience_requirements": ["5+ years backend engineering"],
    "salary_signals": { "min": 150000, "max": 200000, "currency": "USD", "period": "year" },
    "location": "Remote (US)",
    "employment_type": "Full-time",
    "seniority_level": "Senior"
  }
}
```

Response 404: application not found
Response 422: `job_description` is empty/null
Response 502: LLM provider error (logs detail, returns generic message)

### `POST /api/applications/:id/fetch-jd`

Request: none (uses existing `job_posting_url`)

Response 200:
```json
{
  "job_description": "<fetched and cleaned text>",
  "extracted_jd": { ... }
}
```

Response 404: application not found
Response 422: `job_posting_url` is empty/null
Response 502: fetch failed (network, timeout, non-200 status)

---

## Implementation Phases

### Phase 1: LLM Extraction Core
- Add `extracted_jd` column migration in `server/db.js`
- Add extraction service in `server/services/extraction.js` (prompt template, OpenAI client, zod validation)
- Add `POST /api/applications/:id/extract-jd` route
- Add error handling and audit logging for admin access
- Env vars: `OPENAI_API_KEY`, `LLM_MODEL` (default: `gpt-4o-mini`)

### Phase 2: URL Auto-Import
- Add fetch service in `server/services/fetch-jd.js` (axios/fetch with timeout, redirects, HTML-to-text via `html-to-text` or `cheerio`)
- Add `POST /api/applications/:id/fetch-jd` route
- Wire fetch → extraction pipeline (fetch then auto-extract)

### Phase 3: MCP Tools
- Register `extract_job_description` and `fetch_job_description` in `server/mcp.js`
- Reuse the same service functions as the REST routes

### Phase 4: Frontend UI
- Add "Fetch & Extract" button in `ApplicationPanel.vue` (conditional on `job_posting_url`)
- Add structured JD display section (collapsible, read-only)
- Add "Re-extract" button
- API client functions in `client/src/api.js`

### Phase 5: Testing
- Backend tests for extraction endpoint (mock OpenAI client)
- Backend tests for fetch endpoint (mock HTTP responses)
- E2E tests for UI interactions

---

## Fetch Failure Fallback UI

When `POST /api/applications/:id/fetch-jd` fails, the user is in the middle of capturing an application and needs to keep moving. The fallback follows the project's design principles: **forward motion is the hero**, **no modals**, **information density earns its keep**.

### Interaction Flow

```
User clicks "Fetch & Extract"
  → Button enters loading state ("Fetching...")
  → Request fails
    → Toast: "Couldn't fetch from this URL — the site may block automated access"
    → Inline contextual banner appears below Job Posting URL field
    → Job Description auto-switches to edit mode (textarea visible)
    → Textarea receives focus
    → User pastes JD and clicks "Extract"
```

### Inline Contextual Banner

- **Placement:** Between the Job Posting URL field and the Job Description field.
- **Visual treatment:** Uses the existing tip pattern (`bg-accent-muted/20 border border-accent/10 rounded-lg p-2.5`) with the info icon. This is helpful, not alarming — `danger` red would feel too punitive for a recoverable issue.
- **Copy:** "This page blocks automatic fetching. Paste the job description below and click Extract to analyze it."
- **Behavior:** Dismissible? No — it should persist until the user successfully extracts or navigates away. It replaces itself if another fetch is attempted.

### Button States

| State | Label | Visual |
|-------|-------|--------|
| Idle (URL present, no JD) | "Fetch & Extract" | `text-accent` link-style button |
| Loading | (no label) | Disabled, **logo-conveyor spinner** — inline SVG with the three chevron paths using `c`/`c1`/`c2`/`c3` animation classes from `main.css`. Sized at `w-5 h-5`, fill inherits the button's `text-accent` color via `currentColor`. No background rect. |
| Idle (JD present) | "Extract" | `text-accent` link-style button next to JD label |
| Success | — | Banner removed, structured JD section appears |

### Logo-Conveyor Loading Spinner

Reuses the branded conveyor animation already in the design system. The SVG is inlined directly in the button (no separate component needed for this single use):

```html
<svg viewBox="0 0 64 64" class="w-5 h-5" aria-hidden="true">
  <g fill="currentColor">
    <path class="c c1" d="M 12 26 L 16 22 L 26 32 L 16 42 L 12 38 L 18 32 Z" />
    <path class="c c2" d="M 22 22 L 26 18 L 40 32 L 26 46 L 22 42 L 32 32 Z" />
    <path class="c c3" d="M 32 18 L 36 14 L 54 32 L 36 50 L 32 46 L 46 32 Z" />
  </g>
</svg>
```

- **Why this works:** The `jt-conveyor` keyframes and `.c`/`.c1`/`.c2`/`.c3` classes are already defined in `main.css`. The animation loops the three chevrons sliding right with staggered timing — it feels like *forward motion*, which is the product's core design principle.
- **Theming:** `fill="currentColor"` adapts to the button's `text-accent` in both light and dark modes. No hardcoded colors.
- **Sizing:** `w-5 h-5` (20px) keeps it subtle beside the button label or as a standalone spinner in a compact button.
- **Accessibility:** `aria-hidden="true"` — the button's `disabled` state and any adjacent text communicate the loading state to screen readers.

### Auto-Expand Job Description

If `job_description` is in view-only (rendered markdown) mode when fetch fails, the panel automatically switches to edit mode. This removes one click of friction at the exact moment the user needs to paste text.

### Error Copy by Failure Mode

The backend returns descriptive error messages. The frontend toast shows:
- **Anti-bot / 403:** "Couldn't fetch from this URL — the site may block automated access"
- **Timeout:** "The page took too long to respond. Try again or paste the description manually."
- **Network / 404:** "Couldn't reach this page. Check the URL or paste the description manually."
- **Generic:** "Couldn't fetch the job description. Paste it manually to extract details."

## Scope Boundaries

- **In scope:** Structured extraction from existing text, URL fetching, MCP tools, frontend read-only display, fetch failure fallback UI.
- **Not in scope:** Rule-based fallback (deferred to v1.1), editing extracted data in UI, automatic extraction on application creation, batch extraction across all applications.
- **Not in scope:** LLM provider abstraction layer (v1 uses OpenAI directly; abstraction added if a second provider is needed).

---

## Env Vars

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | (none) | Required for JD extraction. Startup warns if missing; extraction endpoints return 503. |
| `LLM_MODEL` | `gpt-4o-mini` | OpenAI model for extraction. |
| `JD_FETCH_TIMEOUT` | `10000` | URL fetch timeout in milliseconds. |
| `JD_FETCH_MAX_REDIRECTS` | `3` | Maximum redirects to follow. |

---

## Acceptance Criteria

- [ ] `POST /api/applications/:id/extract-jd` returns structured JSON for a typical JD.
- [ ] Extraction handles missing/empty `job_description` gracefully (422).
- [ ] Extraction handles LLM failures gracefully (502, no mutation).
- [ ] `POST /api/applications/:id/fetch-jd` fetches HTML, extracts text, updates `job_description`, and triggers extraction.
- [ ] Fetch handles network failures gracefully (502, no mutation).
- [ ] MCP tools `extract_job_description` and `fetch_job_description` work identically to REST endpoints.
- [ ] Frontend shows structured JD in a collapsible panel.
- [ ] All tests pass (backend + E2E).

---

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| LLM provider unavailable | Medium | Return 503; document that extraction is optional. |
| URL fetch blocked by anti-bot | High | Return descriptive 502; user can paste JD manually. |
| JSON schema drift from LLM | Low | Use `response_format: { type: 'json_object' }` + zod validation; retry once on parse failure. |
| Cost surprises at scale | Low | Model is cheap; add metrics/logging to monitor volume. |
| Privacy concerns | Low | Document that JD text is sent to OpenAI; offer local Ollama fallback in v1.1. |

---

## Next Step

Await approval, then proceed to implementation starting with Phase 1 (LLM extraction core).
