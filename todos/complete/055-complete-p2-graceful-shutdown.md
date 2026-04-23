---
status: complete
priority: p2
issue_id: "055"
tags: [ops, reliability, server, best-practices]
dependencies: []
---

# Graceful Shutdown for HTTP Servers and Database

## Summary

`server/index.js` starts two HTTP servers (main app on PORT, MCP on MCP_PORT) and
opens a SQLite database connection, but registers no signal handlers. When the
process receives SIGTERM (Docker stop, Kubernetes pod deletion, systemd restart)
or SIGINT (Ctrl-C), Node.js terminates immediately. In-flight requests are dropped,
partial file uploads may be corrupted, and the SQLite WAL may not checkpoint
cleanly.

## Issues Found

### 1. No SIGTERM / SIGINT handlers
**File:** `server/index.js:1-11`

```js
const app = require('./app')
const { startMcpServer } = require('./mcp')

const PORT = process.env.PORT || 3000
const MCP_PORT = process.env.MCP_PORT || 3001

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Job Tracker server running on http://localhost:${PORT}`)
})

startMcpServer(MCP_PORT)
```

Neither `app.listen()` nor `startMcpServer()` return values are captured, so there
is no way to call `.close()` on them.

### 2. No DB connection cleanup
**File:** `server/db.js:1-205`

The `better-sqlite3` database object is created but never closed. On abrupt exit,
WAL files (`job-tracker.db-shm`, `job-tracker.db-wal`) may remain larger than
necessary. While SQLite is resilient, a clean `db.close()` ensures WAL is
checkpointed and locks are released.

### 3. MCP server return value ignored
**File:** `server/mcp.js:237-241`

```js
const httpServer = app.listen(port, '0.0.0.0', () => {
  console.log(`MCP server running on http://localhost:${port}`)
})

return httpServer
```

`startMcpServer` returns the server, but `index.js` discards it.

## Recommended Actions

- [ ] Capture `server` references from `app.listen()` and `startMcpServer()`
- [ ] Add `process.on('SIGTERM', gracefulShutdown)` and `process.on('SIGINT', gracefulShutdown)`
- [ ] Implement `gracefulShutdown()`:
  1. Stop accepting new connections (`server.close()`)
  2. Wait for in-flight requests to finish (with a timeout, e.g. 10s)
  3. Close the SQLite connection (`db.close()`)
  4. Exit process
- [ ] Export `db` close capability from `db.js` if not already available (`better-sqlite3`
  instances have a `.close()` method)

**Example implementation:**
```js
const httpServer = app.listen(PORT, '0.0.0.0', ...)
const mcpServer = startMcpServer(MCP_PORT)

function gracefulShutdown(signal) {
  console.log(`[shutdown] received ${signal}, closing servers...`)
  const shutdowns = [
    new Promise(resolve => httpServer.close(resolve)),
    new Promise(resolve => mcpServer.close(resolve)),
  ]
  Promise.race([
    Promise.all(shutdowns),
    new Promise(resolve => setTimeout(resolve, 10000))
  ]).then(() => {
    db.close()
    console.log('[shutdown] complete')
    process.exit(0)
  })
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))
```

## Acceptance Criteria

- [ ] `SIGTERM` triggers orderly shutdown: no new connections, existing requests finish,
  DB closes, process exits with code 0
- [ ] `SIGINT` (Ctrl-C) behaves identically in dev
- [ ] Shutdown completes within 10 seconds; force-exits after timeout
- [ ] Docker `docker stop` no longer produces `better-sqlite3` lock warnings
- [ ] Server tests still pass (test runner may need to suppress signal handlers)

## Work Log

- 2026-04-23: Created from code-review ops/reliability audit
