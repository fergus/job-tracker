const express = require('express');
const crypto = require('crypto');
const db = require('../db');

const router = express.Router();

const MAX_KEYS_PER_USER = 20;
const MAX_LABEL_LENGTH = 100;

// All key management endpoints require OAuth authentication (not API key auth).
// Agents must not be able to generate unlimited keys on behalf of users.
function requireOAuth(req, res, next) {
  if (req.authMethod !== 'oauth') {
    return res.status(403).json({ error: 'Key management requires browser authentication' });
  }
  next();
}

// POST /api/keys — generate a new API key
router.post('/', requireOAuth, (req, res) => {
  let label = req.body.label;

  if (label !== null && label !== undefined) {
    label = String(label).trim();
    if (label.length > MAX_LABEL_LENGTH) {
      return res.status(400).json({ error: `Label must be ${MAX_LABEL_LENGTH} characters or fewer` });
    }
    if (label.length === 0) label = null;
  } else {
    label = null;
  }

  const { count } = db.countApiKeysByUser.get(req.userEmail);
  if (count >= MAX_KEYS_PER_USER) {
    return res.status(422).json({ error: `Maximum of ${MAX_KEYS_PER_USER} API keys per user` });
  }

  const rawKey = crypto.randomBytes(32).toString('hex');
  const keyHash = crypto
    .createHmac('sha256', process.env.SERVER_API_KEY_SECRET || 'dev-fallback-secret-do-not-use-in-production')
    .update(rawKey)
    .digest('hex');

  const result = db.insertApiKey.run(req.userEmail, label, keyHash);
  const row = db.listApiKeysByUser.all(req.userEmail).find(k => k.id === result.lastInsertRowid);

  res.status(201).json({
    id: result.lastInsertRowid,
    label: row ? row.label : label,
    created_at: row ? row.created_at : new Date().toISOString(),
    key: rawKey, // only time the raw key is returned
  });
});

// GET /api/keys — list keys for the authenticated user
router.get('/', requireOAuth, (req, res) => {
  const keys = db.listApiKeysByUser.all(req.userEmail);
  // Never include key_hash or expires_at in responses
  res.json(keys.map(k => ({
    id: k.id,
    label: k.label,
    created_at: k.created_at,
    last_used_at: k.last_used_at,
  })));
});

// DELETE /api/keys/:id — revoke a key
router.delete('/:id', requireOAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'Invalid key id' });
  }

  const result = db.deleteApiKey.run(id, req.userEmail);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Key not found' });
  }

  res.status(204).send();
});

module.exports = router;
