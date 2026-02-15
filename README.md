# Job Application Tracker

A single-page web app for tracking job applications through a pipeline — from initial interest through to offer and acceptance. Kanban board with drag-and-drop, table view, file uploads for CVs and cover letters, notes, and date tracking per stage.

## Quick Start

Requirements: [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

```bash
git clone <this-repo>
cd job-tracker
docker compose up --build
```

Open **http://localhost:3000** in your browser.

That's it. The app builds and runs in a single container.

## Updating

Pull the latest changes and rebuild:

```bash
cd job-tracker
git pull
docker compose up --build -d
```

Your data is safe — updates only rebuild the container, not the volume-mounted data directories.

## Data Persistence

All data is stored in Docker volumes mapped to local directories:

- `./data/` — SQLite database
- `./uploads/` — uploaded CV and cover letter files

These directories are created automatically. Your data survives container restarts, rebuilds, and updates.

To back up:

```bash
cp -r data/ data-backup/
cp -r uploads/ uploads-backup/
```

## Features

- **Kanban board** — drag cards between columns: Interested → Applied → Screening → Interview → Offer → Accepted/Rejected
- **Table view** — sortable columns, click any row for details
- **File uploads** — attach CVs and cover letters (PDF, DOC, DOCX up to 10MB)
- **Date tracking** — timestamps auto-set when you move applications between stages
- **Notes & prep** — free-text fields for interview notes and prep work
- **Links** — store job posting and company website URLs

## Configuration

The server runs on port 3000 by default. To change the exposed port, edit `docker-compose.yml`:

```yaml
ports:
  - "8080:3000"  # access on port 8080 instead
```

## Tech Stack

- Vue 3 + Vite + Tailwind CSS (frontend)
- Node.js + Express (backend)
- SQLite via better-sqlite3 (database)
- Single Docker container (multi-stage build)
