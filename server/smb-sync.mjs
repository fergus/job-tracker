#!/usr/bin/env node

/**
 * SMB Sync Engine Entry Point
 *
 * Reads configuration from environment variables, waits for the Express API
 * to be ready, then starts the SyncEngine for two-way file ↔ API sync.
 *
 * Environment variables:
 *   SMB_USER_EMAIL       - Email address for the SMB user (required)
 *   INTERNAL_AUTH_TOKEN   - Auth token for internal API calls (required)
 *   SYNC_DIR             - Directory to sync (default: /app/smb-share)
 *   API_BASE             - Base URL for the Express API (default: http://localhost:3000/api)
 *   SYNC_POLL_INTERVAL   - Polling interval in ms (default: 30000)
 */

import { SyncEngine } from './lib/sync-engine.mjs';

const SMB_USER_EMAIL = process.env.SMB_USER_EMAIL;
const INTERNAL_AUTH_TOKEN = process.env.INTERNAL_AUTH_TOKEN;
const SYNC_DIR = process.env.SYNC_DIR || '/app/smb-share';
const API_BASE = process.env.API_BASE || 'http://localhost:3000/api';
const POLL_INTERVAL = parseInt(process.env.SYNC_POLL_INTERVAL || '30000', 10);

if (!SMB_USER_EMAIL) {
  console.error('[smb-sync] SMB_USER_EMAIL is required');
  process.exit(1);
}

if (!INTERNAL_AUTH_TOKEN) {
  console.error('[smb-sync] INTERNAL_AUTH_TOKEN is required');
  process.exit(1);
}

// Wait for Express API to be ready
async function waitForApi(maxRetries = 30, intervalMs = 1000) {
  console.log(`[smb-sync] Waiting for API at ${API_BASE}/me ...`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(`${API_BASE}/me`, {
        headers: {
          'X-Forwarded-Email': SMB_USER_EMAIL,
          'X-Internal-Auth-Token': INTERNAL_AUTH_TOKEN,
        },
      });
      if (res.ok) {
        console.log('[smb-sync] API is ready');
        return;
      }
    } catch {
      // Connection refused, retry
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  console.error(`[smb-sync] API not ready after ${maxRetries} retries`);
  process.exit(1);
}

async function main() {
  await waitForApi();

  const engine = new SyncEngine({
    apiBase: API_BASE,
    userEmail: SMB_USER_EMAIL,
    syncDir: SYNC_DIR,
    authToken: INTERNAL_AUTH_TOKEN,
  });

  engine.pollIntervalMs = POLL_INTERVAL;

  // Graceful shutdown
  const shutdown = () => {
    engine.stop();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  await engine.start();
}

main().catch(e => {
  console.error(`[smb-sync] Fatal error: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});
