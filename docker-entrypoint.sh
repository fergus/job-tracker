#!/bin/sh
set -e

# Fix volume ownership
chown -R nodejs:nodejs /app/data /app/uploads

# Start Express as main process (PID 1 via exec)
exec su-exec nodejs node server/index.js
