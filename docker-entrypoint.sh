#!/bin/sh
chown -R nodejs:nodejs /app/data /app/uploads
exec su-exec nodejs node server/index.js
