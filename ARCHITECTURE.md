# Architecture

## Overview

Job Application Tracker is a multi-user single-page web application that runs as two Docker containers behind a reverse proxy. A Node.js server serves both the REST API and the pre-built Vue frontend as static files. Authentication is handled externally by oauth2-proxy before requests reach the application. All application data is scoped per-user via the `X-Forwarded-Email` header, with admin users able to view (but not modify) all users' data.

```mermaid
graph LR
    Browser -->|HTTPS| oauth2-proxy
    oauth2-proxy -->|HTTP :3000| App[job-tracker]
    oauth2-proxy -->|OIDC| PocketID

    subgraph Docker Compose
        oauth2-proxy
        App
    end

    App --- DB[(SQLite)]
    App --- FS[/File Storage/]
```

## Request Flow

All incoming requests pass through oauth2-proxy, which authenticates users via OIDC (PocketID) before proxying to the application.

```mermaid
sequenceDiagram
    participant B as Browser
    participant O as oauth2-proxy
    participant P as PocketID
    participant A as job-tracker

    B->>O: GET /
    alt No session cookie
        O->>B: 302 Redirect to PocketID
        B->>P: OIDC login
        P->>B: 302 Redirect with code
        B->>O: /oauth2/callback?code=...
        O->>P: Exchange code for token
        O->>B: Set session cookie
    end
    O->>A: Proxy request
    A->>B: Response (HTML/JSON)
```

## Container Architecture

A single multi-stage Docker build produces the runtime image. The build stage compiles the Vue frontend; the runtime stage bundles only the server, production dependencies, and the built static assets.

```mermaid
graph TB
    subgraph "Docker Build (multi-stage)"
        Build["Build Stage<br/>node:20-alpine<br/>npm run build (Vite)"] --> Dist[client/dist/]
        Runtime["Runtime Stage<br/>node:20-alpine<br/>npm install --omit=dev"]
        Dist --> Runtime
    end

    subgraph "Runtime Container"
        Runtime --> Server["server/index.js<br/>Express :3000"]
        Server --> Static["Static files<br/>client/dist/"]
        Server --> API["REST API<br/>/api/applications/*"]
        API --> SQLite["SQLite<br/>/app/data/job-tracker.db"]
        API --> Uploads["File uploads<br/>/app/uploads/"]
    end
```

Two host-mounted volumes persist data across container restarts:

| Mount | Container Path | Contents |
|-------|---------------|----------|
| `./data/` | `/app/data/` | SQLite database |
| `./uploads/` | `/app/uploads/` | CV and cover letter files |

## Server

The Express server (`server/index.js`) has two responsibilities:

1. **REST API** at `/api/applications/*` — CRUD operations for applications, file uploads, status changes, and stage notes
2. **Static file server** — serves the pre-built Vue SPA from `client/dist/`, with a catch-all route for client-side routing

### Database Schema

SQLite with WAL mode and foreign keys enabled. Tables are auto-created on startup via `CREATE TABLE IF NOT EXISTS`. The `user_email` column on `applications` is added via `ALTER TABLE` migration if missing.

```mermaid
erDiagram
    users {
        INTEGER id PK
        TEXT email
        TEXT first_seen_at
        TEXT last_seen_at
    }

    applications {
        INTEGER id PK
        TEXT company_name
        TEXT role_title
        TEXT status
        TEXT job_description
        TEXT job_posting_url
        TEXT company_website_url
        TEXT cv_filename
        TEXT cv_path
        TEXT cover_letter_filename
        TEXT cover_letter_path
        TEXT user_email
        TEXT created_at
        TEXT applied_at
        TEXT screening_at
        TEXT interview_at
        TEXT offer_at
        TEXT closed_at
        TEXT updated_at
    }

    stage_notes {
        INTEGER id PK
        INTEGER application_id FK
        TEXT stage
        TEXT content
        TEXT created_at
    }

    users ||--o{ applications : "owns"
    applications ||--o{ stage_notes : "has"
```

Stage notes cascade-delete when their parent application is deleted.

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/me` | Current user info (`email`, `isAdmin`) |
| `GET` | `/api/applications` | List user's apps (filter by `?status=`, admin: `?all=true`) |
| `GET` | `/api/applications/:id` | Get single application with notes |
| `POST` | `/api/applications` | Create application (multipart form) |
| `PUT` | `/api/applications/:id` | Update application fields |
| `PATCH` | `/api/applications/:id/status` | Change status (auto-sets date) |
| `POST` | `/api/applications/:id/cv` | Upload/replace CV |
| `GET` | `/api/applications/:id/cv` | Download CV |
| `POST` | `/api/applications/:id/cover-letter` | Upload/replace cover letter |
| `GET` | `/api/applications/:id/cover-letter` | Download cover letter |
| `POST` | `/api/applications/:id/notes` | Create a stage note |
| `DELETE` | `/api/applications/:id/notes/:noteId` | Delete a stage note |
| `DELETE` | `/api/applications/:id` | Delete application (cascades) |

### User Scoping & Authorization

All API requests pass through auth middleware (`server/middleware/auth.js`) which:

1. Reads `X-Forwarded-Email` header set by oauth2-proxy (falls back to `dev@localhost` in dev mode)
2. Upserts the user into the `users` table
3. Claims any legacy applications with `user_email IS NULL` (one-time migration on first login after upgrade)
4. Checks `ADMIN_EMAILS` env var to set `req.isAdmin`
5. Sets `req.userEmail` for downstream route handlers

All application queries are scoped to `user_email = ?` by default. Admin users can view all applications via `?all=true` but cannot edit or delete other users' data.

## Frontend

Vue 3 SPA built with Vite and styled with Tailwind CSS. All state lives in `App.vue` and is passed down as props.

```mermaid
graph TD
    App["App.vue<br/>State & event handling"]
    App --> KB["KanbanBoard.vue<br/>Drag-and-drop columns"]
    App --> TV["TableView.vue<br/>Sortable table"]
    App --> AF["ApplicationForm.vue<br/>Create/edit modal"]
    App --> AD["ApplicationDetail.vue<br/>Detail modal + notes"]
    KB --> KC["KanbanCard.vue<br/>Card in column"]

    AD --> API["api.js<br/>Axios HTTP client"]
    AF --> API
    App --> API
```

### Pipeline Stages

Applications move through a fixed set of stages, each with a corresponding kanban column and color:

| Stage | Color | Date Field |
|-------|-------|------------|
| Interested | Gray | `created_at` |
| Applied | Blue | `applied_at` |
| Screening | Yellow | `screening_at` |
| Interview | Purple | `interview_at` |
| Offer | Green | `offer_at` |
| Accepted | Emerald | `closed_at` |
| Rejected | Red | `closed_at` |

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`):

```mermaid
graph LR
    Push["Push to main<br/>or PR"] --> Build["docker compose build<br/>(verify only)"]
    Tag["Push tag v*"] --> Build
    Tag --> Login["Log in to GHCR"]
    Login --> Push_Image["Build & push to<br/>ghcr.io/fergus/job-tracker<br/>:version + :latest"]
```

- Every push to `main` and every PR runs a build verification
- Pushing a version tag (e.g. `v0.1.0`) builds and publishes the Docker image to GitHub Container Registry
