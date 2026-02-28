# Developer Guide

## Prerequisites

- Node.js 20+
- Docker and Docker Compose (for containerised runs)
- Git

## Project Structure

```
job-tracker/
├── client/                  # Vue 3 frontend
│   ├── src/
│   │   ├── api.js           # Axios HTTP client (all API calls)
│   │   ├── App.vue          # Root component, state management
│   │   ├── main.js          # Vue app entry point
│   │   ├── assets/
│   │   │   └── main.css     # Tailwind CSS entry point
│   │   └── components/
│   │       ├── KanbanBoard.vue       # Drag-and-drop board
│   │       ├── KanbanCard.vue        # Individual card
│   │       ├── TableView.vue         # Sortable table
│   │       ├── TimelineView.vue      # Status history timeline
│   │       ├── SidebarMenu.vue       # Slide-in hamburger menu
│   │       ├── ApplicationForm.vue   # Create/edit modal
│   │       └── ApplicationDetail.vue # Detail modal + notes
│   ├── public/              # Static assets (logo, icons, manifest)
│   ├── index.html           # SPA shell
│   ├── vite.config.js       # Vite + Tailwind CSS plugin, API proxy
│   └── package.json
├── server/                  # Express backend
│   ├── index.js             # App entry, static serving, route mounting
│   ├── db.js                # SQLite setup, table creation, migrations
│   ├── middleware/
│   │   └── auth.js          # User identification via X-Forwarded-Email
│   ├── routes/
│   │   └── applications.js  # All REST endpoints (user-scoped)
│   └── package.json
├── Dockerfile               # Multi-stage build
├── docker-compose.yml       # App + oauth2-proxy
├── .env.example             # Environment variable template
├── .github/workflows/
│   └── build.yml            # CI build + GHCR publish
├── ARCHITECTURE.md          # System architecture docs
└── README.md                # User-facing setup guide
```

## Local Development Setup

### 1. Install dependencies

The server and client have separate `package.json` files. Install both:

```bash
cd server && npm install && cd ..
cd client && npm install && cd ..
```

### 2. Start the dev servers

Run these in two separate terminals:

```bash
# Terminal 1: API server (port 3000)
npm run dev:server

# Terminal 2: Vite dev server (port 5173)
npm run dev:client
```

Open `http://localhost:5173` in your browser. The Vite dev server proxies `/api` requests to the Express server on port 3000 (configured in `client/vite.config.js`).

In dev mode, when the `X-Forwarded-Email` header is absent, the auth middleware falls back to `dev@localhost` as the user identity.

### 3. Hot reload

- **Frontend**: Vite provides HMR — changes to `.vue` files reflect instantly
- **Backend**: The server does not auto-restart. Stop and re-run `npm run dev:server` after changes, or use a tool like `nodemon`:
  ```bash
  npx nodemon server/index.js
  ```

## Running with Docker

Build and run the full stack (app + oauth2-proxy):

```bash
cp .env.example .env
# Edit .env with your PocketID credentials
docker compose up --build -d
```

To iterate quickly on code changes with Docker:

```bash
docker compose up --build -d
docker compose logs -f job-tracker
```

## Database

SQLite database stored at `data/job-tracker.db`. Tables are auto-created on server startup via `CREATE TABLE IF NOT EXISTS` in `server/db.js`.

### Inspecting the database

```bash
sqlite3 data/job-tracker.db
```

Useful queries:

```sql
.tables
.schema applications
.schema stage_notes
SELECT id, company_name, status FROM applications;
SELECT * FROM stage_notes WHERE application_id = 1;
```

### Schema changes

There is no migration system. Schema changes use `CREATE TABLE IF NOT EXISTS`, so new tables are added automatically on restart. For column changes to existing tables, you would need to handle migration manually (e.g. `ALTER TABLE` in `db.js` or recreate the database).

### Resetting the database

Delete the file and restart the server:

```bash
rm data/job-tracker.db
npm run dev:server   # or docker compose up --build -d
```

## API Reference

All request/response bodies are JSON unless noted as multipart. All application endpoints are scoped to the authenticated user via `req.userEmail`.

### Current User

```
GET /api/me
```

Returns `{ email, isAdmin }` for the authenticated user.

### Applications

Base URL: `/api/applications`

#### List applications

```
GET /api/applications
GET /api/applications?status=interview
GET /api/applications?all=true          # admin only: show all users' applications
```

Returns an array of applications, each with a `notes` array attached. Ordered by `updated_at` descending. Results are scoped to the current user unless `?all=true` is passed by an admin.

#### Get single application

```
GET /api/applications/:id
```

Returns the application with its `notes` array.

#### Create application

```
POST /api/applications
Content-Type: multipart/form-data

Required: company_name, role_title
Optional: status, job_description, job_posting_url, company_website_url
Files:    cv, cover_letter
```

Returns `201` with the created application.

#### Update application

```
PUT /api/applications/:id
Content-Type: application/json

{
  "company_name": "...",
  "role_title": "...",
  "job_description": "...",
  "job_posting_url": "...",
  "company_website_url": "..."
}
```

All fields optional. At least one must be provided.

#### Change status

```
PATCH /api/applications/:id/status
Content-Type: application/json

{ "status": "interview" }
```

Valid statuses: `interested`, `applied`, `screening`, `interview`, `offer`, `accepted`, `rejected`.

Automatically sets the corresponding date field (e.g. `interview_at`) to the current time.

#### Delete application

```
DELETE /api/applications/:id
```

Deletes the application, its stage notes (FK cascade), and any uploaded files from disk.

### File Uploads

#### Upload/replace CV

```
POST /api/applications/:id/cv
Content-Type: multipart/form-data

Field: cv (file, max 10MB, .pdf/.doc/.docx)
```

#### Download CV

```
GET /api/applications/:id/cv
```

#### Upload/replace cover letter

```
POST /api/applications/:id/cover-letter
Content-Type: multipart/form-data

Field: cover_letter (file, max 10MB, .pdf/.doc/.docx)
```

#### Download cover letter

```
GET /api/applications/:id/cover-letter
```

### Stage Notes

#### Create note

```
POST /api/applications/:id/notes
Content-Type: application/json

{ "stage": "interview", "content": "Went well, expect next round" }
```

Returns `201` with the created note.

#### Delete note

```
DELETE /api/applications/:id/notes/:noteId
```

## Frontend Conventions

### State management

All application state lives in `App.vue` as a flat `applications` ref. Child components receive data via props and communicate back via events. There is no Vuex/Pinia store.

UI preferences (`compactHeader`, default view) are initialised in `onMounted` based on viewport width and a `localStorage` key (`jobtracker_compact_header`), so they persist across refreshes without any server involvement.

### Event flow

```
Child component
  └─ emits event (e.g. 'notes-changed', 'status-change')
      └─ App.vue handler
          ├─ calls API
          ├─ reloads applications list
          └─ updates selectedApp ref (for open detail modals)
```

### Adding a new component

1. Create the `.vue` file in `client/src/components/`
2. Import and use it in `App.vue` (or in the parent component)
3. Pass data via props, emit events for mutations
4. Add any new API calls to `client/src/api.js`

### Styling

Tailwind CSS 4 with the `@tailwindcss/vite` plugin — no PostCSS config or `tailwind.config.js` needed. Utility classes are applied directly in templates. Colour scheme for pipeline stages is defined inline in components that need it (KanbanBoard, TableView, ApplicationDetail).

### Modals and overlays

Modals and overlays use `z-index` layering: the sidebar (`SidebarMenu`) sits at `z-40`; application modals (form, detail) sit at `z-50` so they appear above the sidebar when both are open. Body scroll is locked (`document.body.style.overflow = 'hidden'`) while the sidebar or a modal is open.

## CI/CD

GitHub Actions workflow at `.github/workflows/build.yml`:

- **Push to `main` / PR**: runs `docker compose build` to verify the image builds
- **Push a version tag** (`v*`): builds and pushes to `ghcr.io/fergus/job-tracker` with version and `latest` tags

### Releasing a new version

1. **Bump the version** in all three `package.json` files (root, client, server).
   Use the helper scripts to keep them in sync:
   ```bash
   npm run version:patch   # 0.2.0 → 0.2.1
   npm run version:minor   # 0.2.0 → 0.3.0
   npm run version:major   # 0.2.0 → 1.0.0
   ```
2. **Commit the version bump**:
   ```bash
   git add package.json client/package.json server/package.json
   git commit -m "chore: bump version to vX.Y.Z"
   ```
3. **Tag the commit** with a `v` prefix:
   ```bash
   git tag vX.Y.Z
   ```
4. **Push the commit and tag**:
   ```bash
   git push origin main --tags
   ```
5. **Create a GitHub release**:
   ```bash
   gh release create vX.Y.Z --title "vX.Y.Z" --notes "Release notes here..."
   ```

The GitHub Actions workflow will automatically build and push the Docker image when a version tag is pushed.

## Testing with curl

Quick smoke test against a running server (adjust port/host as needed):

```bash
# In dev mode, X-Forwarded-Email is optional (defaults to dev@localhost).
# Include the header to simulate a specific user:

# Create an application
curl -s -X POST http://localhost:3000/api/applications \
  -H 'X-Forwarded-Email: dev@localhost' \
  -F 'company_name=Acme' -F 'role_title=Engineer' | jq

# Add a note
curl -s -X POST http://localhost:3000/api/applications/1/notes \
  -H 'X-Forwarded-Email: dev@localhost' \
  -H 'Content-Type: application/json' \
  -d '{"stage":"screening","content":"Phone screen scheduled"}' | jq

# Change status
curl -s -X PATCH http://localhost:3000/api/applications/1/status \
  -H 'X-Forwarded-Email: dev@localhost' \
  -H 'Content-Type: application/json' \
  -d '{"status":"screening"}' | jq

# List all
curl -s http://localhost:3000/api/applications \
  -H 'X-Forwarded-Email: dev@localhost' | jq

# Current user info
curl -s http://localhost:3000/api/me \
  -H 'X-Forwarded-Email: dev@localhost' | jq

# Delete
curl -s -X DELETE http://localhost:3000/api/applications/1 \
  -H 'X-Forwarded-Email: dev@localhost' | jq
```

When running inside Docker, use `docker exec` to reach the app container directly:

```bash
docker exec job-tracker-job-tracker-1 \
  curl -s http://localhost:3000/api/applications | jq
```
