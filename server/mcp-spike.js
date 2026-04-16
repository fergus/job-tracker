'use strict';

// Spike only — validates SSE/Streamable HTTP connectivity through Caddy.
// Delete this file and revert index.js after the spike is confirmed working.

const crypto = require('node:crypto');
const express = require('express');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const db = require('./db.js');

const apiKeySecret = process.env.NODE_ENV === 'production'
  ? process.env.SERVER_API_KEY_SECRET
  : (process.env.SERVER_API_KEY_SECRET || 'dev-fallback-secret-do-not-use-in-production');

if (process.env.NODE_ENV === 'production' && !apiKeySecret) {
  throw new Error('[mcp-spike] SERVER_API_KEY_SECRET is required in production');
}

function validateApiKey(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'API key required' });
  }
  const rawToken = authHeader.slice(7);
  const keyHash = crypto.createHmac('sha256', apiKeySecret).update(rawToken).digest('hex');
  const row = db.getApiKeyByHash.get(keyHash);
  if (!row) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  req.userEmail = row.user_email;
  next();
}

function makeMcpServer() {
  const server = new McpServer({ name: 'job-tracker-spike', version: '0.0.1' });
  server.tool('ping', 'Test connectivity to the job tracker MCP server', {}, async () => ({
    content: [{ type: 'text', text: 'pong' }],
  }));
  return server;
}

const app = express();
app.use(express.json());

const sessions = new Map();

// POST without session ID → initialise a new session
// POST/GET/DELETE with mcp-session-id → route to existing session
app.all('/mcp', validateApiKey, async (req, res) => {
  try {
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId) {
      const transport = sessions.get(sessionId);
      if (!transport) return res.status(404).json({ error: 'Session not found' });
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (req.method === 'POST') {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id) => { sessions.set(id, transport); },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      await makeMcpServer().connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({ error: 'Missing mcp-session-id header' });
  } catch (err) {
    console.error('[mcp-spike] Error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

const MCP_PORT = parseInt(process.env.MCP_PORT || '3001', 10);
app.listen(MCP_PORT, '0.0.0.0', () => {
  console.log(`[mcp-spike] Running on http://localhost:${MCP_PORT}`);
});
