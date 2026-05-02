'use strict';
const { randomUUID, createHmac } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const db = require('./db');
const svc = require('./services/applications');
const { extractStructuredJD } = require('./services/extraction');
const { fetchJobDescription, FetchError } = require('./services/fetch-jd');

// API key secret — same config as auth middleware
let apiKeySecret;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SERVER_API_KEY_SECRET) {
    throw new Error('SERVER_API_KEY_SECRET environment variable is required in production');
  }
  apiKeySecret = process.env.SERVER_API_KEY_SECRET;
} else {
  if (!process.env.SERVER_API_KEY_SECRET) {
    console.warn('[mcp] SERVER_API_KEY_SECRET not set — using static dev fallback. Set this in production.');
  }
  apiKeySecret = process.env.SERVER_API_KEY_SECRET || 'dev-fallback-secret-do-not-use-in-production';
}

function resolveApiKey(rawToken) {
  const keyHash = createHmac('sha256', apiKeySecret).update(rawToken).digest('hex');
  const row = db.getApiKeyByHash.get(keyHash);
  if (!row) return null;
  Promise.resolve().then(() => db.updateApiKeyLastUsed.run(row.id)).catch(() => {});
  return row.user_email;
}

// Convert a ServiceError into MCP tool content so the LLM sees the message.
function toolError(err) {
  if (err instanceof svc.ServiceError) {
    return { content: [{ type: 'text', text: `Error ${err.status}: ${err.message}` }], isError: true };
  }
  throw err;
}

function createMcpServer() {
  const server = new McpServer({ name: 'job-tracker', version: '1.0.0' });

  server.tool(
    'list_applications',
    'List all job applications with their current status and key dates.',
    {
      status: z.enum(['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'])
        .optional()
        .describe('Filter by status'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.listApplications(userEmail, { status: args.status });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'get_application',
    'Get a job application by ID, including all notes and attachment metadata.',
    {
      id: z.number().int().positive().describe('Application ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.getApplication(userEmail, args.id);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'create_application',
    'Create a new job application.',
    {
      company_name: z.string().min(1).max(200).describe('Company name'),
      role_title: z.string().min(1).max(200).describe('Job title'),
      status: z.enum(['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'])
        .optional()
        .describe('Initial status (defaults to "interested")'),
      job_description: z.string().max(10000).optional().describe('Job description'),
      job_posting_url: z.string().max(2000).optional().describe('URL of the job posting'),
      company_website_url: z.string().max(2000).optional().describe('Company website URL'),
      interview_notes: z.string().max(10000).optional().describe('Interview notes'),
      prep_work: z.string().max(10000).optional().describe('Prep work notes'),
      job_location: z.string().max(500).optional().describe('Job location'),
      salary_min: z.number().int().nonnegative().optional().nullable().describe('Minimum salary'),
      salary_max: z.number().int().nonnegative().optional().nullable().describe('Maximum salary'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.createApplication(userEmail, args);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'update_application',
    'Update fields on an existing job application.',
    {
      id: z.number().int().positive().describe('Application ID'),
      company_name: z.string().min(1).max(200).optional().describe('Company name'),
      role_title: z.string().min(1).max(200).optional().describe('Job title'),
      job_description: z.string().max(10000).optional().describe('Job description'),
      job_posting_url: z.string().max(2000).optional().describe('URL of the job posting'),
      company_website_url: z.string().max(2000).optional().describe('Company website URL'),
      interview_notes: z.string().max(10000).optional().describe('Interview notes'),
      prep_work: z.string().max(10000).optional().describe('Prep work notes'),
      job_location: z.string().max(500).optional().describe('Job location'),
      salary_min: z.number().int().nonnegative().optional().nullable().describe('Minimum salary'),
      salary_max: z.number().int().nonnegative().optional().nullable().describe('Maximum salary'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      const { id, ...data } = args;
      try {
        const result = svc.updateApplication(userEmail, id, data);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'update_status',
    'Change the status of a job application. Automatically sets the corresponding date field.',
    {
      id: z.number().int().positive().describe('Application ID'),
      status: z.enum(['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'])
        .describe('New status'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.updateStatus(userEmail, args.id, args.status);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'add_note',
    'Add a stage note to a job application.',
    {
      id: z.number().int().positive().describe('Application ID'),
      stage: z.enum(['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'])
        .describe('Stage this note applies to'),
      content: z.string().min(1).max(10000).describe('Note content'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.addNote(userEmail, args.id, { stage: args.stage, content: args.content });
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'list_attachments',
    'List attachments for a job application (filename, size, type — no binary content).',
    {
      id: z.number().int().positive().describe('Application ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const result = svc.listAttachments(userEmail, args.id);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'get_attachment_text',
    'Get the extracted plain text from a file attachment (PDF, DOCX, TXT, MD).',
    {
      application_id: z.number().int().positive().describe('Application ID'),
      attachment_id: z.number().int().positive().describe('Attachment ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const attachment = svc.getAttachment(userEmail, args.application_id, args.attachment_id);
        if (attachment.extracted_text === null || attachment.extracted_text === undefined) {
          return { content: [{ type: 'text', text: 'No extracted text available for this attachment' }], isError: true };
        }
        return { content: [{ type: 'text', text: attachment.extracted_text }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'get_user_profile',
    'Get the candidate profile (resume, career narrative, agent instructions) for the authenticated user.',
    {},
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const profile = db.prepare('SELECT * FROM user_profiles WHERE user_email = ?').get(userEmail);
        if (!profile) {
          return { content: [{ type: 'text', text: 'No profile found' }], isError: true };
        }
        return { content: [{ type: 'text', text: JSON.stringify(profile, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'get_application_context',
    'Get the full context for a job application: application details, notes, attachments with extracted text, and user profile.',
    {
      application_id: z.number().int().positive().describe('Application ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_email = ?').get(args.application_id, userEmail);
        if (!app) {
          return { content: [{ type: 'text', text: 'Application not found' }], isError: true };
        }
        const notes = db.prepare('SELECT * FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC').all(args.application_id);
        const attachments = db.prepare('SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?').all(args.application_id);
        const profile = db.prepare('SELECT * FROM user_profiles WHERE user_email = ?').get(userEmail);

        return { content: [{ type: 'text', text: JSON.stringify({
          application: app,
          notes,
          attachments,
          profile: profile || null,
          job_description: app.job_description || null,
        }, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'upload_attachment',
    'Upload a file attachment to an existing job application.',
    {
      application_id: z.number().int().positive().describe('Application ID'),
      file_path: z.string().min(1).describe('Absolute path to the file on disk'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        if (!fs.existsSync(args.file_path)) {
          return { content: [{ type: 'text', text: `File not found: ${args.file_path}` }], isError: true };
        }
        const buffer = fs.readFileSync(args.file_path);
        const originalname = path.basename(args.file_path);
        const result = await svc.uploadAttachments(userEmail, args.application_id, [{ originalname, buffer }]);
        return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'extract_job_description',
    'Extract structured data (skills, responsibilities, salary, etc.) from the existing job description text of an application.',
    {
      application_id: z.number().int().positive().describe('Application ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_email = ?').get(args.application_id, userEmail);
        if (!app) {
          return { content: [{ type: 'text', text: 'Application not found' }], isError: true };
        }
        if (!app.job_description || !app.job_description.trim()) {
          return { content: [{ type: 'text', text: 'Job description is empty' }], isError: true };
        }
        const extracted = await extractStructuredJD(app.job_description);
        if (!extracted) {
          return { content: [{ type: 'text', text: 'Extraction failed. The LLM service may be unavailable.' }], isError: true };
        }
        const now = new Date().toISOString();
        db.prepare('UPDATE applications SET extracted_jd = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(extracted), now, args.application_id);
        return { content: [{ type: 'text', text: JSON.stringify(extracted, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  server.tool(
    'fetch_job_description',
    'Fetch a job description from the job_posting_url, store it on the application, and extract structured data.',
    {
      application_id: z.number().int().positive().describe('Application ID'),
    },
    async (args, extra) => {
      const userEmail = extra.authInfo?.clientId;
      if (!userEmail) return { content: [{ type: 'text', text: 'Unauthorized' }], isError: true };
      try {
        const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_email = ?').get(args.application_id, userEmail);
        if (!app) {
          return { content: [{ type: 'text', text: 'Application not found' }], isError: true };
        }
        if (!app.job_posting_url || !app.job_posting_url.trim()) {
          return { content: [{ type: 'text', text: 'Job posting URL is empty' }], isError: true };
        }
        let text;
        try {
          text = await fetchJobDescription(app.job_posting_url);
        } catch (fetchErr) {
          if (fetchErr instanceof FetchError) {
            return { content: [{ type: 'text', text: fetchErr.message }], isError: true };
          }
          throw fetchErr;
        }
        const now = new Date().toISOString();
        db.prepare('UPDATE applications SET job_description = ?, updated_at = ? WHERE id = ?').run(text, now, args.application_id);
        const extracted = await extractStructuredJD(text);
        if (extracted) {
          db.prepare('UPDATE applications SET extracted_jd = ? WHERE id = ?').run(JSON.stringify(extracted), args.application_id);
        }
        return { content: [{ type: 'text', text: JSON.stringify({ job_description: text, extracted_jd: extracted }, null, 2) }] };
      } catch (err) { return toolError(err); }
    }
  );

  return server;
}

function startMcpServer(port) {
  const app = express();
  app.set('trust proxy', 1);

  // Security headers — MCP is JSON-only, so CSP is disabled.
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));

  // Rate limiting — separate bucket from the main API.
  const mcpLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MCP ?? '60', 10),
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use(mcpLimiter);

  // Body size cap — same limit as the main app.
  app.use(express.json({ limit: '100kb' }));

  // Authenticate every request with an API key
  app.use((req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing API key' });
    }
    const userEmail = resolveApiKey(authHeader.slice(7));
    if (!userEmail) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
    req.auth = { token: authHeader.slice(7), clientId: userEmail, scopes: [] };
    next();
  });

  // Session map: sessionId → StreamableHTTPServerTransport
  const sessions = new Map();

  app.all('/', async (req, res) => {
    try {
      const sessionId = req.headers['mcp-session-id'];

      if (sessionId) {
        // Route to existing session
        const transport = sessions.get(sessionId);
        if (!transport) return res.status(404).json({ error: 'Session not found' });
        await transport.handleRequest(req, res, req.body);
      } else if (req.method === 'POST') {
        // New session (Initialize handshake) — each session needs its own McpServer
        // because McpServer can only connect to one transport at a time.
        const mcpServer = createMcpServer();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid) => sessions.set(sid, transport),
          onsessionclosed: async (sid) => {
            sessions.delete(sid);
            try { await mcpServer.close(); } catch {}
          },
        });
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } else {
        res.status(400).json({ error: 'No session ID provided' });
      }
    } catch (err) {
      console.error('[mcp] unhandled error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
    }
  });

  const httpServer = app.listen(port, '0.0.0.0', () => {
    console.log(`MCP server running on http://localhost:${port}`);
  });

  return httpServer;
}

module.exports = { startMcpServer };
