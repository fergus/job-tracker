const db = require('../db');

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const internalAuthToken = process.env.INTERNAL_AUTH_TOKEN || null;

const upsertUser = db.prepare(`
  INSERT INTO users (email, first_seen_at, last_seen_at)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at
`);

function authMiddleware(req, res, next) {
  const email = req.headers['x-forwarded-email'];
  const internalToken = req.headers['x-internal-auth-token'];

  if (!email) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.userEmail = 'dev@localhost';
  } else if (internalToken && internalAuthToken && internalToken === internalAuthToken) {
    // Trusted internal request from sync engine — accept X-Forwarded-Email directly
    req.userEmail = email.toLowerCase();
  } else if (process.env.NODE_ENV === 'production' && !req.headers['x-forwarded-user']) {
    // In production, X-Forwarded-Email without oauth2-proxy headers or valid internal token is suspicious
    return res.status(401).json({ error: 'Authentication required' });
  } else {
    req.userEmail = email.toLowerCase();
  }

  const now = new Date().toISOString();
  upsertUser.run(req.userEmail, now, now);

  req.isAdmin = adminEmails.includes(req.userEmail);

  next();
}

module.exports = authMiddleware;
