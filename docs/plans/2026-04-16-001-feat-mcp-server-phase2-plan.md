---
title: "feat: MCP Server (Phase 2)"
type: feat
status: active
date: 2026-04-16
origin: docs/brainstorms/2026-04-06-mcp-server-smb-removal-requirements.md
---

# feat: MCP Server (Phase 2)

## Overview

Add a Model Context Protocol (MCP) server to the job tracker so AI agents can
discover and use the application's CRUD operations without manual REST API
documentation. Phase 1 (API key auth) is complete in v0.9.1. This plan covers
Phase 2: validation spike → service layer extraction → MCP server.

## Architecture

The MCP SDK's SSE/Streamable HTTP server (Hono-based) runs in the same Node.js
process as Express on a separate internal port (3001). Caddy, which terminates
TLS for `jobs.intervl.com`, proxies `/mcp` directly to port 3001 — bypassing
oauth2-proxy. API key auth (Phase 1) handles access control for MCP traffic.

```
Browser → Caddy → oauth2-proxy → Express :3000 → SQLite
MCP client → Caddy /mcp → MCP :3001 ──────────────↑
```

Caddy routes `jobs.intervl.com` by host IP + published port (`192.168.1.82:3562`
→ oauth2-proxy). The current Ansible Jinja2 template is per-subdomain only; it
needs extending to support path-based routes so `/mcp*` can be proxied to a
separate port while `/*` continues through oauth2-proxy. The MCP port is
published from the job-tracker container (not oauth2-proxy) so Caddy can reach
it directly.

## Steps

### Step 1 — SSE Spike (blocks Step 3)

**Goal:** Confirm MCP clients (Claude Code, Claude Desktop) can connect to
`https://jobs.intervl.com/mcp` via SSE/Streamable HTTP through the full
production path: MCP client → Caddy → Docker → MCP server.

**This spike is throwaway.** All temporary changes (mcp-spike.mjs, server.js
edits, published port, Ansible route) persist only until the spike is validated.
Step 3 builds the real implementation from scratch.

#### 1a — Extend Ansible Caddy template for path-based routing

The `homelab-manager` Caddyfile.j2 template currently supports one upstream per
vhost. Extend it to support an optional `routes` list per vhost — each route
specifies a path prefix and upstream, rendered as `handle_path` blocks before
the catch-all `reverse_proxy`.

Example vhost config after template change:
```yaml
- name: jobs
  upstream: http://192.168.1.82:3562       # existing — oauth2-proxy
  routes:
    - path: /mcp*
      upstream: http://192.168.1.82:3563   # new — MCP server
      flush_interval: true
```

Rendered Caddy block:
```caddy
@jobs host jobs.intervl.com
handle @jobs {
    handle_path /mcp* {
        reverse_proxy http://192.168.1.82:3563 {
            flush_interval -1
        }
    }
    reverse_proxy http://192.168.1.82:3562
}
```

`flush_interval -1` is required to disable Caddy response buffering for SSE.
The path-based `handle_path` block must appear before the catch-all `reverse_proxy`.

#### 1b — Build the spike MCP server

1. Add `@modelcontextprotocol/sdk` to `server/package.json`.
2. Create `server/mcp-spike.mjs` — a minimal `McpServer` with:
   - One tool: `ping` → returns `"pong"`.
   - API key auth using the same HMAC-SHA256 check as `server/middleware/auth.js`
     (`SERVER_API_KEY_SECRET` env var). Unauthenticated requests → reject.
   - Starts on `process.env.MCP_PORT || 3001`.
3. Modify `server/server.js` to import and start `mcp-spike.mjs` after Express.

#### 1c — Publish the MCP port

Add to the `job-tracker` service in `docker-compose.yml`:
```yaml
ports:
  - "${MCP_PORT:-3001}:3001"
```
Set `MCP_PORT=3563` in the server's `.env` to match the Caddy upstream port.

#### 1d — Deploy and validate

1. Build and push image; deploy to test server.
2. Run Ansible to apply the updated Caddy config.
3. Add the server to Claude Code:
   ```
   claude mcp add --transport sse --url https://jobs.intervl.com/mcp job-tracker
   ```
   Test: the `ping` tool appears and returns `"pong"`.
4. Optionally test from Claude Desktop.

#### 1e — Cleanup after success

Remove `server/mcp-spike.mjs`, revert `server/server.js`, remove the published
MCP port from `docker-compose.yml`, and remove `MCP_PORT` from the server env.
The Ansible route and Caddy template extension remain — they are production
infrastructure, not spike scaffolding.

**If the spike fails:** Reassess transport. Options: Streamable HTTP only, or a
local stdio-to-SSE proxy on the client side.

**Acceptance:** Claude Code (or Desktop) successfully calls the `ping` tool via
`https://jobs.intervl.com/mcp` using a valid API key.

---

### Step 2 — Service Layer Extraction

**Goal:** Extract Express route handler logic into standalone service functions
so both Express routes and MCP tools can share them without threading `req`/`res`.

**Pattern:** Each handler becomes a `service(userEmail, ...args) → data` function
in `server/services/applications.js`. Express routes call the service and handle
HTTP concerns (status codes, JSON serialization). MCP tool handlers call the same
service with the resolved `userEmail` from API key auth.

**Functions to extract** (from `server/routes/applications.js`):

| Service function | Replaces handler for |
|---|---|
| `listApplications(userEmail, filters?)` | `GET /api/applications` |
| `getApplication(userEmail, id)` | `GET /api/applications/:id` |
| `createApplication(userEmail, data)` | `POST /api/applications` |
| `updateApplication(userEmail, id, data)` | `PUT /api/applications/:id` |
| `updateStatus(userEmail, id, status)` | `PATCH /api/applications/:id/status` |
| `deleteApplication(userEmail, id)` | `DELETE /api/applications/:id` |
| `addNote(userEmail, appId, data)` | `POST /api/applications/:id/notes` |
| `listAttachments(userEmail, appId)` | `GET /api/applications/:id/attachments` |
| `getAttachment(userEmail, appId, attachmentId)` | `GET /:id/attachments/:attachmentId` |

Routes in `server/routes/keys.js` do not need extraction (API key management is
not exposed via MCP — agents generate keys through the web UI).

**Acceptance:** All existing REST API behaviour unchanged after extraction.
Manual test against the running server.

---

### Step 3 — MCP Server Implementation

**Goal:** Replace the spike's `mcp-spike.mjs` with production MCP tooling.

**File:** `server/mcp.mjs` — creates and exports an `McpServer` instance.

**Startup:** `server/server.js` imports and starts both Express (port 3000) and
the MCP server (port 3001) in the same process.

**Authentication:** Use the MCP SDK's auth hook to validate the `Authorization:
Bearer <key>` header, resolve `userEmail`, and pass it to tool handlers — same
HMAC-SHA256 comparison as in `server/middleware/auth.js`. Unauthenticated
requests → 401.

**Tools:**

| Tool name | Service call | Description exposed to agent |
|---|---|---|
| `list_applications` | `listApplications(userEmail)` | List all job applications with status and dates |
| `get_application` | `getApplication(userEmail, id)` | Get full application including notes and attachment metadata |
| `create_application` | `createApplication(userEmail, data)` | Create a new job application |
| `update_application` | `updateApplication(userEmail, id, data)` | Update application fields |
| `update_status` | `updateStatus(userEmail, id, status)` | Change application status (interested/applied/screening/interview/offer/accepted/rejected) |
| `add_note` | `addNote(userEmail, appId, data)` | Add a stage note to an application |
| `list_attachments` | `listAttachments(userEmail, appId)` | List attachments for an application |

Attachment binary retrieval is not exposed via MCP (10MB PDFs impractical as
base64 in JSON). `get_application` includes attachment metadata with filenames
and sizes.

**MCP SDK version:** `@modelcontextprotocol/sdk` latest stable. Confirm the
Hono HTTP transport is available in that version (validated in spike).

**Acceptance:**
- MCP client can list, create, update applications and add notes.
- Auth enforced: invalid/missing key → 401; valid key → scoped to key owner.
- Express API unaffected.

---

### Step 4 — Docker and Caddy Infrastructure

**Docker:**
- Add `expose: "3001"` to `job-tracker` service in `docker-compose.yml` (internal
  port, not published to host — Caddy reaches it over the Docker network).
- Add `MCP_PORT=3001` to the `environment` block (or hardcode it).
- Remove the temporary published port from the spike.

**Caddy (test server, `/etc/caddy/Caddyfile` or site config):**

```caddy
jobs.intervl.com {
    # Existing: web traffic through oauth2-proxy
    reverse_proxy /oauth2/* oauth2-proxy:4180
    reverse_proxy /* oauth2-proxy:4180

    # MCP: bypass oauth2-proxy, disable buffering for SSE
    reverse_proxy /mcp* job-tracker:3001 {
        flush_interval -1
    }
}
```

The `/mcp` block must appear before the catch-all `/*` block in Caddy's
routing so MCP traffic is not sent through oauth2-proxy.

> **Note:** If Caddy cannot reach Docker containers by service name (depends on
> network setup), publish port 3001 to a specific host port and proxy to
> `127.0.0.1:<port>` instead. Confirm during spike deployment.

**Acceptance:**
- `docker compose up` starts without error.
- Caddy routes `/mcp` to port 3001 and web traffic through oauth2-proxy as before.
- No SSE timeout/buffering issues.

---

### Step 5 — Release and Deploy

1. Run `npm run version:minor` (MCP server is a minor feature addition → v0.10.0).
2. Commit, tag, push — GitHub Actions builds and pushes the image.
3. Deploy to test server:
   ```bash
   ssh docker 'cd job-tracker && docker compose pull && docker compose up -d'
   ```
4. Update Caddy config on test server and reload.
5. Smoke test: MCP client calls `list_applications` and `create_application`.

---

## Scope Boundaries

- **Out of scope:** Attachment uploads via MCP (read-only access only).
- **Out of scope:** Admin privilege via API keys (keys are always user-scoped).
- **Out of scope:** Key expiry enforcement (schema has nullable `expires_at`, not used yet).
- **Out of scope:** stdio MCP transport (SSE/HTTP only).
- **Out of scope:** Streamable HTTP if SSE works (implement whichever transport the spike validates).
- **Out of scope:** Document generation (cover letters, resume tailoring) — separate ideation item.

## Open Questions

- Can Caddy (running on the host) reach `job-tracker:3001` by Docker service name,
  or does the MCP port need to be published? → Determined during spike deployment.
- Which MCP SDK version to pin? → Confirmed during spike installation.
- Does the Hono transport support both SSE and Streamable HTTP, or must we choose? → Check SDK docs during spike.

## Related Documents

- **Brainstorm:** `docs/brainstorms/2026-04-06-mcp-server-smb-removal-requirements.md`
- **Phase 1 plan (shipped):** `docs/plans/2026-04-14-001-feat-api-keys-smb-removal-plan.md`
- **Ideation:** `docs/ideation/2026-04-06-smb-to-mcp-agent-integration-ideation.md`
