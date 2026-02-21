const db = require('../db');

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

const upsertUser = db.prepare(`
  INSERT INTO users (email, first_seen_at, last_seen_at)
  VALUES (?, ?, ?)
  ON CONFLICT(email) DO UPDATE SET last_seen_at = excluded.last_seen_at
`);

const claimLegacyApps = db.prepare(`
  UPDATE applications SET user_email = ? WHERE user_email IS NULL
`);

const hasUnclaimedApps = db.prepare(`
  SELECT 1 FROM applications WHERE user_email IS NULL LIMIT 1
`);

function authMiddleware(req, res, next) {
  const email = req.headers['x-forwarded-email'];

  if (!email) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.userEmail = 'dev@localhost';
  } else {
    req.userEmail = email.toLowerCase();
  }

  const now = new Date().toISOString();
  upsertUser.run(req.userEmail, now, now);

  // Claim legacy applications (user_email IS NULL) on first login after upgrade
  if (hasUnclaimedApps.get()) {
    claimLegacyApps.run(req.userEmail);
  }

  req.isAdmin = adminEmails.includes(req.userEmail);

  next();
}

module.exports = authMiddleware;
