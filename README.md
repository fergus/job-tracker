# Job Application Tracker

[![Build](https://github.com/fergus/job-tracker/actions/workflows/build.yml/badge.svg)](https://github.com/fergus/job-tracker/actions/workflows/build.yml)

A single-page web app for tracking job applications through a pipeline — from initial interest through to offer and acceptance. Kanban board with drag-and-drop, table view, file uploads for CVs and cover letters, notes, and date tracking per stage.

## Quick Start

Requirements: [Docker](https://docs.docker.com/get-docker/) and Docker Compose, and a [PocketID](https://github.com/pocket-id/pocket-id) instance for authentication.

**1. Clone and configure:**

```bash
git clone <this-repo>
cd job-tracker
cp .env.example .env
```

**2. Set up PocketID:**

In your PocketID admin panel, create a new OIDC client:
- **Redirect URI:** `https://your-domain.com/oauth2/callback`
- Note the **Client ID** and **Client Secret**

**3. Edit `.env`** with your values:

```env
OIDC_ISSUER_URL=https://your-pocketid-instance.example.com
OIDC_CLIENT_ID=your-client-id
OIDC_CLIENT_SECRET=your-client-secret
PUBLIC_URL=https://your-domain.com
COOKIE_SECRET=   # generate with: openssl rand -base64 32 | tr -- '+/' '-_'
LISTEN_PORT=3000
```

**4. Start:**

```bash
docker compose up --build -d
```

Open your `PUBLIC_URL` in a browser. You'll be redirected to PocketID to log in.

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

The server runs on port 3000 by default. To change the exposed port, set `LISTEN_PORT` in your `.env`:

```env
LISTEN_PORT=8080
```

To run without HTTPS (e.g. local dev), set:

```env
COOKIE_SECURE=false
```

## Tech Stack

- Vue 3 + Vite + Tailwind CSS (frontend)
- Node.js + Express (backend)
- SQLite via better-sqlite3 (database)
- Single Docker container (multi-stage build)
