# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

```bash
# Install dependencies (separate package.json for client and server)
cd server && npm install && cd ..
cd client && npm install && cd ..

# Development: run in two terminals
npm run dev:server    # Express API on :3000
npm run dev:client    # Vite dev server on :5173 (proxies /api to :3000)

# Production (Docker)
docker compose up --build -d

# Build client only
npm run build:client

# Version bump (syncs root, client, server package.json)
npm run version:patch   # or version:minor, version:major
```

No test framework or linter is configured.

## Deploying to Test Server

The test server is at docker.intervl.com. SSH access is via the `docker` host alias (key already configured):

```bash
ssh docker 'cd job-tracker && docker compose pull && docker compose up -d'
```

After a release, tag it and the GitHub Actions workflow will build and push the image to GHCR. Then run the above to deploy.

## Architecture

Full-stack job application tracker: Vue 3 SPA + Express REST API + SQLite.

**Frontend** (`client/`): Vue 3 Composition API, Vite, Tailwind CSS 4. All state lives in `App.vue` as a flat `applications` ref — no Vuex/Pinia. Props down, events up. API calls centralized in `client/src/api.js` (Axios).

**Backend** (`server/`): Express 5 with direct better-sqlite3 queries (no ORM). All routes in `server/routes/applications.js`. Database auto-created on startup via `CREATE TABLE IF NOT EXISTS` in `server/db.js` — no migration system.

**Auth**: User identity comes from the `X-Forwarded-Email` header set by oauth2-proxy (OIDC/PocketID). Auth middleware (`server/middleware/auth.js`) extracts the email, upserts into the `users` table, and sets `req.userEmail`/`req.isAdmin` on every API request. In dev mode, falls back to `dev@localhost` when the header is absent.

**Data**: SQLite at `data/job-tracker.db` (WAL mode, foreign keys). Three tables: `users`, `applications` (with `user_email` column for per-user scoping), and `stage_notes` (cascade delete). File uploads stored in `uploads/` via multer (10MB limit, PDF/DOC/DOCX).

## Key Patterns

- Status changes via `PATCH /api/applications/:id/status` auto-set corresponding date fields (`applied_at`, `screening_at`, etc.)
- Valid statuses: interested, applied, screening, interview, offer, accepted, rejected
- Pipeline stage colors are defined inline in components (KanbanBoard, TableView, ApplicationDetail)
- The GET `/api/applications` endpoint returns each application with its `notes` array attached, sorted by `created_at` ASC
- All application queries are scoped to `user_email = ?` by default. Admin users (configured via `ADMIN_EMAILS` env var, comma-separated) can view all users' applications but cannot edit/delete others' data
- `GET /api/me` returns the current user's email and admin status
- In development, Vite proxies `/api` to Express (configured in `client/vite.config.js`). In production, Express serves the built SPA from `client/dist/`
