---
title: Graceful Shutdown — SIGTERM/SIGINT Handling for HTTP Servers and SQLite
date: 2026-04-23
category: workflow-issues
module: Server process lifecycle
problem_type: workflow_issue
component: server
severity: high
symptoms:
  - "In-flight requests dropped on Docker stop or Ctrl-C"
  - "SQLite WAL files left uncleaned after abrupt process termination"
  - "MCP server port remains occupied after main process exits"
root_cause: missing_implementation
resolution_type: code_fix
related_components:
  - database
  - mcp_server
tags:
  - ops
  - reliability
  - server
  - best-practices
  - signal-handling
  - graceful-shutdown
  - docker
  - sqlite
---

# Graceful Shutdown — SIGTERM/SIGINT Handling for HTTP Servers and SQLite

## Problem

`server/index.js` started two HTTP servers (Express on PORT, MCP on MCP_PORT) and opened a SQLite database connection via `better-sqlite3`, but never registered signal handlers. When the process received SIGTERM (Docker stop, Kubernetes pod deletion, systemd restart) or SIGINT (Ctrl-C in dev), Node.js terminated immediately. In-flight requests were dropped, partial file uploads could be corrupted, and the SQLite WAL was not checkpointed cleanly.

## Symptoms

- HTTP requests in progress return empty responses or connection resets when the container is redeployed
- `job-tracker.db-wal` and `job-tracker.db-shm` files grow larger than necessary because the WAL is never checkpointed on exit
- Docker logs show `better-sqlite3` lock warnings after `docker stop`
- The MCP server's port (3001) can remain occupied if the main process crashes without releasing it
- Local development with Ctrl-C leaves the terminal in an unclean state with no shutdown confirmation

## What Didn't Work

- **Discarding `app.listen()` and `startMcpServer()` return values:** The original code called both functions but never captured the returned `http.Server` instances. Without those references, `.close()` could not be called, making graceful shutdown impossible.
- **Relying on SQLite's crash resilience as a substitute for clean shutdown:** While `better-sqlite3` will recover from an abrupt exit via the WAL, it does not checkpoint uncommitted pages back into the main database file. Over time this leaves WAL files larger than necessary and defers cleanup to the next startup.
- **Closing the database before the HTTP servers:** In early draft implementations, calling `db.close()` before `server.close()` allowed in-flight requests to attempt database access after the connection was terminated, causing unhandled query errors.
- **Waiting indefinitely for connections to drain:** A naive `Promise.all(shutdowns)` without a timeout could hang forever if a malicious or slow client held a keep-alive connection open, preventing the container from ever exiting.
- **Handling only SIGTERM:** In local development, developers send SIGINT via Ctrl-C. If only SIGTERM is wired, dev behavior diverges from production and developers see abrupt exits during routine restarts.

## Solution

### 1. Capture server references

In `server/index.js`, assign the return values of `app.listen()` and `startMcpServer()`:

```js
const httpServer = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`);
});

const mcpServer = startMcpServer(MCP_PORT);
```

### 2. Implement `gracefulShutdown`

Add a shutdown function that closes both servers with a 10-second timeout, then closes SQLite and exits cleanly:

```js
function gracefulShutdown(signal) {
  console.log(`[shutdown] received ${signal}, closing servers...`);

  const shutdowns = [
    new Promise((resolve) => httpServer.close(resolve)),
    new Promise((resolve) => mcpServer.close(resolve)),
  ];

  Promise.race([
    Promise.all(shutdowns),
    new Promise((resolve) => setTimeout(resolve, 10000)),
  ])
    .catch((err) => {
      console.error('[shutdown] error during close:', err.message);
    })
    .then(() => {
      try {
        db.close();
        console.log('[shutdown] complete');
      } catch (err) {
        console.error('[shutdown] error closing db:', err.message);
      }
      process.exit(0);
    });
}
```

### 3. Register signal handlers

Wire both SIGTERM and SIGINT to the same shutdown routine:

```js
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
```

### 4. Export `db` from `db.js` for cleanup

`server/db.js` already exports the `better-sqlite3` database instance, so `index.js` can require it and call `db.close()` during shutdown:

```js
const db = require('./db');
```

## Why This Works

- `app.listen()` returns an `http.Server` instance whose `.close()` method stops accepting new connections and waits for existing keep-alive sockets to finish, preventing abrupt request drops.
- `Promise.race` against a 10-second timeout guarantees the process will exit even if a malicious or slow client holds a connection open indefinitely.
- Closing the network interfaces (`httpServer` and `mcpServer`) *before* `db.close()` ensures no in-flight request attempts to use the database after the connection is terminated.
- `better-sqlite3`'s `db.close()` finalizes prepared statements and forces a WAL checkpoint into the main database file, preventing stale WAL growth.
- Handling both `SIGTERM` (container orchestrators, systemd) and `SIGINT` (Ctrl-C, local dev) makes the behavior consistent across every environment the app runs in.

## Prevention

- **Capture `app.listen()` return values** — always assign `const server = app.listen(...)` at the top level of the entry file so shutdown code can call `server.close()`.
- **Close in the right order: network → database → process** — write the shutdown sequence so listeners stop accepting work before data resources are released.
- **Guard with a timeout** — never wait indefinitely for connections to drain; cap graceful shutdown at 10–15 seconds and then force-exit.
- **Unit-test the shutdown path** — spawn the server in a child process, send `SIGTERM`, and assert that the exit code is `0` and that no `.db-wal` file grows unbounded after a tracked request.
- **Audit factory functions that start servers** — if a module exposes something like `startMcpServer()`, document and consume its return value so callers can manage the lifecycle.
- **Add a readiness health-check** — once shutdown begins, start returning HTTP 503 on `/health` so load balancers remove the instance from rotation before the timeout window closes.

## Related

- [File Cleanup Ordering — Orphaned Uploads on Partial Failure](../logic-errors/file-cleanup-ordering-orphaned-uploads-2026-04-23.md) — same commit; closing servers cleanly prevents in-flight requests from being interrupted mid-cleanup
- `todos/complete/055-complete-p2-graceful-shutdown.md` — original problem definition and acceptance criteria
