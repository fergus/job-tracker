# AGENTS.md — Job Application Tracker

This file is the source of truth for AI coding agents working on this repository. If something here conflicts with a general assumption, this file wins.

---

## Project Overview

Job Application Tracker is a multi-user single-page web application for tracking job applications through a pipeline (Interested → Applied → Screening → Interview → Offer → Accepted/Rejected). It is self-hosted, designed for deliberate job seekers, and scoped per-user via email identity. Admins can view all users' data read-only.

The project ships as a single Docker image. In production it runs behind `oauth2-proxy` (OIDC via PocketID). The Express server serves both the REST API and the pre-built Vue SPA static files.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vue 3, Vite, Tailwind CSS 4, Axios, `vuedraggable`, `marked`, `dompurify` |
| Backend | Node.js 20+, Express 5, `better-sqlite3`, `multer`, `helmet`, `express-rate-limit`, `zod` |
| Database | SQLite (WAL mode enabled) |
| Auth | OAuth2-proxy (browser) + Bearer API keys (programmatic) |
| MCP | `@modelcontextprotocol/sdk` server on port 3001 |
| Build | Docker multi-stage build (node:24-alpine) |
| CI/CD | GitHub Actions — test, then build/push to GHCR on version tags |

There is **no TypeScript**. Server code uses CommonJS; client code uses ES modules (`"type": "module"`).

---

## Project Structure

```
job-tracker/
├── client/                  # Vue 3 frontend
│   ├── src/
│   │   ├── api.js           # Axios HTTP client — ALL API calls live here
│   │   ├── App.vue          # Root component; owns the `applications` ref
│   │   ├── main.js          # Vue entry point
│   │   ├── assets/
│   │   │   └── main.css     # Tailwind CSS entry + design tokens + animations
│   │   ├── components/      # All .vue components (PascalCase)
│   │   └── composables/     # Reusable composition functions (e.g. useToast.js)
│   ├── public/              # Static assets (logo.svg, favicons, manifest)
│   ├── index.html           # SPA shell
│   ├── vite.config.js       # Vite + Tailwind plugin; proxies /api to localhost:3000
│   ├── generate-icons.js    # Sharp-based script that generates PNG favicons from logo.svg
│   └── package.json
├── server/                  # Express backend
│   ├── index.js             # Entry point: starts HTTP + MCP servers
│   ├── app.js               # Express app setup (middleware, routes, static files, CSP)
│   ├── db.js                # SQLite setup, table creation, migrations, prepared statements
│   ├── mcp.js               # MCP server definition and HTTP transport
│   ├── middleware/
│   │   └── auth.js          # Bearer API key or X-Forwarded-Email OAuth auth
│   ├── routes/
│   │   ├── applications.js  # Application CRUD, notes, attachments, CV/cover-letter
│   │   └── keys.js          # API key management (OAuth-only)
│   ├── services/
│   │   └── applications.js  # Business logic + validation (ServiceError class)
│   ├── test/
│   │   └── api.test.js      # Node built-in test runner + supertest
│   └── package.json
├── Dockerfile               # Multi-stage: build client → runtime server
├── docker-compose.yml       # App + oauth2-proxy stack
├── docker-entrypoint.sh     # Fixes volume ownership, execs server as nodejs user
├── .env.example             # Environment variable template
├── .github/workflows/
│   └── build.yml            # CI: test → docker build → push on v* tags
├── package.json             # Root orchestrator (dev scripts, version bump helpers)
└── docs/                    # Architecture diagrams, screenshots, planning docs, documented solutions (docs/solutions/)
```

`docs/solutions/` — documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (`module`, `tags`, `problem_type`). Relevant when implementing or debugging in documented areas.

---

## Build and Test Commands

Install dependencies (server and client are separate):

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

Development (run in two terminals):

```bash
npm run dev:server   # Express API on :3000
npm run dev:client   # Vite dev server on :5173 (proxies /api to :3000)
```

Build the frontend:

```bash
npm run build:client
```

Run tests:

```bash
cd server && npm test           # backend API tests
npm run build:client && cd client && npm run test:e2e   # frontend E2E tests
```

The backend **does not auto-restart** in dev. Stop and re-run `npm run dev:server`, or use `npx nodemon server/index.js`.

### Version bumping (keeps root + client + server in sync)

```bash
npm run version:patch   # or version:minor / version:major
```

---

## Local Development

- Open `http://localhost:5173`.
- Vite proxies `/api` to the Express server on `:3000`.
- In dev mode, if `X-Forwarded-Email` is absent, auth middleware falls back to `dev@localhost`.
- To simulate a specific user, send `X-Forwarded-Email: alice@example.com`.
- The SQLite database is created at `data/job-tracker.db` (relative to repo root).

---

## Architecture Notes

### State Management (Frontend)

All application state lives as a flat `applications` ref in `App.vue`. There is **no Vuex/Pinia** store.

- Child components receive data via props.
- Child components emit events for mutations.
- `App.vue` handles events → calls API → reloads list → updates `selectedApp` for open panels.

UI preferences (`compactHeader`, default view) are stored in `localStorage` (`jobtracker_compact_header`) and initialised based on viewport width.

### Event Flow

```
Child component
  └─ emits event (e.g. 'status-change', 'notes-changed')
      └─ App.vue handler
          ├─ calls API
          ├─ reloads applications list
          └─ updates selectedApp ref (for open detail modals)
```

### Styling

- Tailwind CSS 4 with the `@tailwindcss/vite` plugin. **No `tailwind.config.js` or PostCSS config.**
- Custom design tokens (colors, fonts, motion) are defined in `client/src/assets/main.css` inside `:root` and `@theme inline`.
- Colors use OKLCH. Stage colours are semantic (e.g. `--stage-interested`, `--stage-applied`).
- Both light and dark modes are first-class (`prefers-color-scheme: dark`).
- Motion is purposeful and respects `prefers-reduced-motion: reduce`.
- Utility classes are applied directly in templates. No CSS-in-JS.

### Modals / Overlays

- `SidebarMenu` sits at `z-40`.
- Application modals (`ApplicationPanel`, detail view) sit at `z-50`.
- Body scroll is locked (`document.body.style.overflow = 'hidden'`) while sidebar or a modal is open on mobile.

---

## Database and Migrations

SQLite with WAL mode and foreign keys enabled.

- **Auto-creation**: Tables are created on startup via `CREATE TABLE IF NOT EXISTS` in `server/db.js`.
- **Column migrations**: New columns are added via `ALTER TABLE` guarded by `PRAGMA table_info` checks, also in `server/db.js`.
- **One-shot migrations**: Recorded in `_migrations` table so they run once (e.g. the `cv_to_attachments` backfill).
- **Destructive changes** (renaming/dropping columns) must be handled manually or by recreating the database.
- To reset: `rm data/job-tracker.db` and restart the server.

### Tables

- `users` — `email`, `first_seen_at`, `last_seen_at`
- `applications` — job details, status, dates, salary, location, CV/cover letter paths, `user_email`
- `stage_notes` — per-application notes with stage and markdown content
- `attachments` — generic file attachments (cascade-delete with application)
- `api_keys` — hashed keys per user, with label and last-used tracking
- `_migrations` — tracks one-shot data migrations

---

## Auth and Security

Auth middleware (`server/middleware/auth.js`) supports two methods:

1. **Bearer token (API key)**: `Authorization: Bearer <token>`. The token is HMAC-SHA256 hashed with `SERVER_API_KEY_SECRET` and looked up in `api_keys`. Sets `req.userEmail`, `req.isAdmin = false`, `req.authMethod = 'api_key'`. Cannot be used for key management endpoints.
2. **OAuth (browser)**: Production requires `X-Forwarded-User` and `X-Forwarded-Email` headers (injected by oauth2-proxy). Dev falls back to `dev@localhost` if headers are absent. Sets `req.isAdmin` based on `ADMIN_EMAILS` env var.

### Security Practices

- `helmet` with a strict CSP (no external scripts; fonts from Google).
- Rate limiting on `/api` (default 100 req/min) and upload endpoints (default 20 req/min).
- `trust proxy` enabled for Express behind a reverse proxy.
- File uploads are restricted to `.pdf`, `.doc`, `.docx`, `.md`, `.txt`, max 10 MB.
- `safePath()` prevents directory traversal for uploaded files.
- `SERVER_API_KEY_SECRET` is **required** in production; hard-fail on startup if missing.
- Admin users can view and download any user's applications/attachments (audit-logged), but **cannot** create, update, or delete other users' records.

---

## API Conventions

- Base path: `/api`
- All JSON bodies are scoped to the authenticated user via `req.userEmail`.
- Admin can pass `?all=true` on list endpoints to view all users' data.
- `PATCH /api/applications/:id/status` auto-sets the corresponding `*_at` date field.
- `PATCH /api/applications/:id/dates` allows manual editing of stage date fields (pass `null` to clear).
- Create application accepts `multipart/form-data` (allows CV + cover letter upload). Update accepts `application/json`.
- API key auth uses `application/json` for create/update (not multipart).

See `ARCHITECTURE.md` and `DEVELOPING.md` for the full endpoint reference.

---

## Testing Instructions

The project uses Node.js built-in `node:test` with `supertest`.

```bash
cd server && npm test
```

Tests run against an **in-memory** database (`DB_PATH=:memory:`) with rate limiting disabled.

**Backend tests** (`server/test/api.test.js`) use Node.js built-in `node:test` with `supertest`.

**Frontend E2E tests** (`client/e2e/`) use Playwright to verify view rendering in a real browser — they catch DOM/transition issues that unit tests miss.

Quick smoke test via curl (dev mode):

```bash
curl -s http://localhost:3000/api/applications -H 'X-Forwarded-Email: dev@localhost' | jq
```

---

## CI/CD and Deployment

GitHub Actions workflow (`.github/workflows/build.yml`):

1. **Test job**: installs server and client deps with `npm ci`, runs backend tests, builds the client, installs Playwright browsers, and runs E2E tests.
2. **Docker build job**: depends on test. Runs `docker compose build`.
3. **Push**: on `v*` tag push, logs into GHCR and pushes `ghcr.io/fergus/job-tracker:<version>` and `:latest`.

Release process:

```bash
npm run version:patch   # bumps root, client, server package.json
# commit, tag vX.Y.Z, push with --tags
# create GitHub release: gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."
```

---

## MCP Server

A Model Context Protocol server runs on port 3001 (configurable via `MCP_PORT`). It exposes tools for LLM clients to list, get, create, update, and add notes to job applications. Authentication is via Bearer API key only. The MCP server reuses the same `services/applications.js` business logic as the REST API.

Tools: `list_applications`, `get_application`, `create_application`, `update_application`, `update_status`, `add_note`, `list_attachments`.

---

## Design Context (for UI changes)

- **Personality**: tactical, forward, sharp.
- **Aesthetic**: bold, editorial, typographically driven. Mission board meets editorial spread.
- **Color carries meaning**: stage colours are a system, not decoration.
- **Both themes first-class**: light and dark modes are fully designed.
- **Anti-patterns**: no gradient text, no glassmorphism, no hero metrics, no generic admin-dashboard look.

See `PRODUCT.md` for the full design brief.

---

## File Naming and Coding Conventions

- **Vue components**: PascalCase (`KanbanBoard.vue`, `ApplicationPanel.vue`).
- **Server files**: camelCase or kebab-case (`auth.js`, `applications.js`).
- **API client**: all HTTP calls are named exports in `client/src/api.js`.
- **No semicolons** are enforced by style in the Vue/client codebase; server code uses standard Node.js style (semicolons present).
- **Error handling**: server uses a `ServiceError` class (`services/applications.js`) for expected validation errors; unexpected errors bubble to the Express error handler.
