const crypto = require('crypto');
const db = require('../db');

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const internalAuthToken = process.env.INTERNAL_AUTH_TOKEN || null;
const internalAuthEmail = (process.env.SMB_USER_EMAIL || '').toLowerCase() || null;

function timingSafeEqual(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
  } else if (internalToken && internalAuthToken && timingSafeEqual(internalToken, internalAuthToken)) {
    // Trusted internal request from sync engine — only accept configured SMB_USER_EMAIL
    if (!internalAuthEmail || email.toLowerCase() !== internalAuthEmail) {
      return res.status(403).json({ error: 'Internal token not authorized for this user' });
    }
    req.userEmail = internalAuthEmail;
  } else if (process.env.NODE_ENV === 'production') {
    // In production, require oauth2-proxy headers (X-Forwarded-User proves request came through proxy)
    if (!req.headers['x-forwarded-user']) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.userEmail = email.toLowerCase();
  } else {
    req.userEmail = email.toLowerCase();
  }

  const now = new Date().toISOString();
  upsertUser.run(req.userEmail, now, now);

  req.isAdmin = adminEmails.includes(req.userEmail);

  next();
}

module.exports = authMiddleware;
