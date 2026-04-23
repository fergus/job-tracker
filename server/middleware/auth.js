const crypto = require('crypto');
const db = require('../db');

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// SERVER_API_KEY_SECRET: hard-fail in production if absent; warn + use fallback in dev.
let apiKeySecret;
if (process.env.NODE_ENV === 'production') {
  if (!process.env.SERVER_API_KEY_SECRET) {
    throw new Error('SERVER_API_KEY_SECRET environment variable is required in production');
  }
  apiKeySecret = process.env.SERVER_API_KEY_SECRET;
} else {
  if (!process.env.SERVER_API_KEY_SECRET) {
    console.warn('[auth] SERVER_API_KEY_SECRET not set — using static dev fallback. Set this in production.');
  }
  apiKeySecret = process.env.SERVER_API_KEY_SECRET || 'dev-fallback-secret-do-not-use-in-production';
}

const upsertUser = db.prepare(`
  INSERT INTO users (email, first_seen_at, last_seen_at)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at
`);

// Cache seen emails for 60s to avoid a DB write on every request.
const upsertCache = new Map();
const UPSERT_TTL_MS = 60_000;

function cachedUpsertUser(email) {
  const now = Date.now();
  // Prune stale entries when the cache grows past 1000
  if (upsertCache.size > 1000) {
    for (const [k, v] of upsertCache) {
      if (now - v > UPSERT_TTL_MS) upsertCache.delete(k);
    }
  }
  const last = upsertCache.get(email);
  if (last && now - last < UPSERT_TTL_MS) return;
  upsertCache.set(email, now);
  upsertUser.run(email, new Date(now).toISOString(), new Date(now).toISOString());
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];

  // 1. Bearer token → API key auth
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const rawToken = authHeader.slice(7);
    const keyHash = crypto.createHmac('sha256', apiKeySecret).update(rawToken).digest('hex');
    const row = db.getApiKeyByHash.get(keyHash);

    if (!row) {
      console.warn('[auth] invalid API key from %s', req.ip);
      return res.status(401).json({ error: 'Invalid API key' });
    }

    req.userEmail = row.user_email;
    req.isAdmin = false;
    req.authMethod = 'api_key';

    // Fire-and-forget last_used_at update
    Promise.resolve().then(() => db.updateApiKeyLastUsed.run(row.id)).catch(() => {});

    cachedUpsertUser(req.userEmail);

    return next();
  }

  // 2. OAuth path (X-Forwarded-User proves request passed through oauth2-proxy)
  if (process.env.NODE_ENV === 'production') {
    const email = req.headers['x-forwarded-email'];
    if (!req.headers['x-forwarded-user'] || !email) {
      console.warn('[auth] rejected OAuth request: missing forwarded headers from %s', req.ip);
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.userEmail = email.toLowerCase();
    req.authMethod = 'oauth';
  } else if (req.headers['x-forwarded-email']) {
    // Dev mode: accept X-Forwarded-Email directly (no proxy required)
    req.userEmail = req.headers['x-forwarded-email'].toLowerCase();
    req.authMethod = 'oauth';
  } else {
    // 3. Dev fallback
    req.userEmail = 'dev@localhost';
    req.authMethod = 'oauth';
  }

  cachedUpsertUser(req.userEmail);

  req.isAdmin = adminEmails.includes(req.userEmail);

  next();
}

module.exports = authMiddleware;
