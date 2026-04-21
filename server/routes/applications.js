const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const svc = require('../services/applications');
const { ServiceError, VALID_STATUSES, uploadsDir, safePath } = svc;

const router = express.Router();

fs.mkdirSync(uploadsDir, { recursive: true });

const ALLOWED_EXTENSIONS = ['.pdf', '.doc', '.docx', '.md', '.txt'];

const MIME_MAP = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.md': 'text/plain',
  '.txt': 'text/plain',
};

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only .pdf, .doc, .docx, .md, and .txt files are allowed'));
  }
}

const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 }, fileFilter });

// Converts a ServiceError to an HTTP response; re-throws unexpected errors.
function handleError(res, err) {
  if (err instanceof ServiceError) return res.status(err.status).json({ error: err.message });
  throw err;
}

// Ownership check used by routes that aren't delegated to a service function.
function getOwnApp(id, userEmail) {
  return db.prepare('SELECT * FROM applications WHERE id = ? AND user_email = ?').get(id, userEmail);
}

function attachNotes(rows) {
  const ids = rows.map(r => r.id);
  if (ids.length === 0) return rows;
  const placeholders = ids.map(() => '?').join(',');
  const notes = db.prepare(`SELECT * FROM stage_notes WHERE application_id IN (${placeholders}) ORDER BY created_at ASC`).all(...ids);
  const notesByApp = {};
  for (const n of notes) {
    (notesByApp[n.application_id] ||= []).push(n);
  }
  return rows.map(r => ({ ...r, notes: notesByApp[r.id] || [] }));
}

// List applications (scoped to user, or all if admin with ?all=true)
router.get('/', (req, res) => {
  try {
    if (req.isAdmin && req.query.all === 'true') {
      console.info('[admin] %s listed all applications', req.userEmail);
    }
    res.json(svc.listApplications(req.userEmail, {
      status: req.query.status,
      all: req.query.all,
      updated_since: req.query.updated_since,
      isAdmin: req.isAdmin,
    }));
  } catch (e) { handleError(res, e); }
});

// Get single application (own or admin view)
router.get('/:id', (req, res) => {
  try {
    res.json(svc.getApplication(req.userEmail, req.params.id, { isAdmin: req.isAdmin }));
  } catch (e) { handleError(res, e); }
});

// Create application (multipart for CV + cover letter)
router.post('/', upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'cover_letter', maxCount: 1 }]), (req, res) => {
  try {
    const data = { ...req.body };
    if (req.files?.cv?.[0]) {
      data.cv_filename = req.files.cv[0].originalname;
      data.cv_path = req.files.cv[0].filename;
    }
    if (req.files?.cover_letter?.[0]) {
      data.cover_letter_filename = req.files.cover_letter[0].originalname;
      data.cover_letter_path = req.files.cover_letter[0].filename;
    }
    res.status(201).json(svc.createApplication(req.userEmail, data));
  } catch (e) { handleError(res, e); }
});

// Update application fields (owner only)
router.put('/:id', (req, res) => {
  try {
    res.json(svc.updateApplication(req.userEmail, req.params.id, req.body));
  } catch (e) { handleError(res, e); }
});

// Change status (owner only)
router.patch('/:id/status', (req, res) => {
  try {
    res.json(svc.updateStatus(req.userEmail, req.params.id, req.body.status));
  } catch (e) { handleError(res, e); }
});

// Upload/replace CV (owner only)
router.post('/:id/cv', upload.single('cv'), (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (existing.cv_path) {
    const oldPath = safePath(uploadsDir, existing.cv_path);
    if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE applications SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ? AND user_email = ?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id, req.userEmail);

  res.json(db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id));
});

// Download CV (own or admin view)
router.get('/:id/cv', (req, res) => {
  const existing = req.isAdmin
    ? db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
    : getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!existing.cv_path) return res.status(404).json({ error: 'No CV uploaded' });

  const filePath = safePath(uploadsDir, existing.cv_path);
  if (!filePath) return res.status(400).json({ error: 'Invalid file path' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  if (req.isAdmin && existing.user_email !== req.userEmail) {
    console.info('[admin] %s downloaded CV for app %s owned by %s', req.userEmail, req.params.id, existing.user_email);
  }
  const cvMime = MIME_MAP[path.extname(existing.cv_filename).toLowerCase()] || 'application/octet-stream';
  res.setHeader('Content-Type', cvMime);
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

// Upload/replace cover letter (owner only)
router.post('/:id/cover-letter', upload.single('cover_letter'), (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (existing.cover_letter_path) {
    const oldPath = safePath(uploadsDir, existing.cover_letter_path);
    if (oldPath && fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE applications SET cover_letter_filename = ?, cover_letter_path = ?, updated_at = ? WHERE id = ? AND user_email = ?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id, req.userEmail);

  res.json(db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id));
});

// Download cover letter (own or admin view)
router.get('/:id/cover-letter', (req, res) => {
  const existing = req.isAdmin
    ? db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id)
    : getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!existing.cover_letter_path) return res.status(404).json({ error: 'No cover letter uploaded' });

  const filePath = safePath(uploadsDir, existing.cover_letter_path);
  if (!filePath) return res.status(400).json({ error: 'Invalid file path' });
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  if (req.isAdmin && existing.user_email !== req.userEmail) {
    console.info('[admin] %s downloaded cover letter for app %s owned by %s', req.userEmail, req.params.id, existing.user_email);
  }
  const clMime = MIME_MAP[path.extname(existing.cover_letter_filename).toLowerCase()] || 'application/octet-stream';
  res.setHeader('Content-Type', clMime);
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(filePath);
});

// List attachments for an application (own or admin view)
router.get('/:id/attachments', (req, res) => {
  try {
    res.json(svc.listAttachments(req.userEmail, req.params.id, { isAdmin: req.isAdmin }));
  } catch (e) { handleError(res, e); }
});

// Upload attachments (owner only)
router.post('/:id/attachments', upload.array('files', 10), (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) {
    if (req.files) req.files.forEach(f => { try { fs.unlinkSync(f.path); } catch {} });
    return res.status(404).json({ error: 'Not found' });
  }
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  const now = new Date().toISOString();
  const inserted = [];

  const insertAttachments = db.transaction(() => {
    for (const file of req.files) {
      const ext = path.extname(file.originalname).toLowerCase();
      const mime = MIME_MAP[ext] || null;
      const result = db.prepare(
        'INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type, created_at) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(req.params.id, file.originalname, file.filename, file.size, mime, now);
      inserted.push({ id: result.lastInsertRowid, original_filename: file.originalname, file_size: file.size, mime_type: mime, created_at: now });
    }
    db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  });

  insertAttachments();
  res.status(201).json(inserted);
});

// Download a specific attachment (own or admin view)
// Admins can download attachments for any application (read-only). Files leave
// the server boundary — admin downloads are audit-logged via the line below.
router.get('/:id/attachments/:attachmentId', (req, res) => {
  try {
    const attachment = svc.getAttachment(req.userEmail, req.params.id, req.params.attachmentId, { isAdmin: req.isAdmin });
    const filePath = safePath(uploadsDir, attachment.stored_filename);
    if (!filePath) return res.status(400).json({ error: 'Invalid file path' });
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    if (req.isAdmin) {
      console.info('[admin] %s downloaded attachment %s from app %s', req.userEmail, req.params.attachmentId, req.params.id);
    }
    const mime = attachment.mime_type || MIME_MAP[path.extname(attachment.original_filename).toLowerCase()] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', 'inline');
    res.sendFile(filePath);
  } catch (e) { handleError(res, e); }
});

// Delete a specific attachment (owner only)
router.delete('/:id/attachments/:attachmentId', (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const attachment = db.prepare('SELECT * FROM attachments WHERE id = ? AND application_id = ?').get(req.params.attachmentId, req.params.id);
  if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

  const now = new Date().toISOString();
  db.prepare('DELETE FROM attachments WHERE id = ?').run(req.params.attachmentId);
  db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id);

  const filePath = safePath(uploadsDir, attachment.stored_filename);
  if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

  res.json({ success: true });
});

// Update date fields (owner only)
router.patch('/:id/dates', (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const DATE_FIELDS = ['interested_at', 'applied_at', 'screening_at', 'interview_at', 'offer_at', 'closed_at'];
  const updates = [];
  const values = [];

  for (const field of DATE_FIELDS) {
    if (req.body[field] === undefined) continue;
    const val = req.body[field];
    if (val === null) {
      updates.push(`${field} = ?`);
      values.push(null);
    } else if (typeof val === 'string' && !isNaN(Date.parse(val))) {
      updates.push(`${field} = ?`);
      values.push(val);
    } else {
      return res.status(400).json({ error: `Invalid date value for ${field}` });
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No date fields to update' });
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(req.params.id);
  values.push(req.userEmail);

  db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ? AND user_email = ?`).run(...values);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(attachNotes([row])[0]);
});

// Delete application (owner only — no admin bypass)
router.delete('/:id', (req, res) => {
  try {
    res.json(svc.deleteApplication(req.userEmail, req.params.id));
  } catch (e) { handleError(res, e); }
});

// Create a stage note (owner only)
router.post('/:id/notes', (req, res) => {
  try {
    res.status(201).json(svc.addNote(req.userEmail, req.params.id, req.body));
  } catch (e) { handleError(res, e); }
});

// Update a stage note (owner only)
router.put('/:id/notes/:noteId', (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const note = db.prepare('SELECT * FROM stage_notes WHERE id = ? AND application_id = ?').get(req.params.noteId, req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const { content, stage } = req.body;
  if (!content) return res.status(400).json({ error: 'content is required' });
  if (content.length > 10000) {
    return res.status(400).json({ error: 'content exceeds maximum length of 10000 characters' });
  }

  const now = new Date().toISOString();
  const updates = ['content = ?', 'updated_at = ?'];
  const values = [content, now];

  if (stage) {
    if (!VALID_STATUSES.includes(stage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }
    updates.push('stage = ?');
    values.push(stage);
  }

  values.push(req.params.noteId);
  db.prepare(`UPDATE stage_notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id);

  res.json(db.prepare('SELECT * FROM stage_notes WHERE id = ?').get(req.params.noteId));
});

// Delete a stage note (owner only)
router.delete('/:id/notes/:noteId', (req, res) => {
  const existing = getOwnApp(req.params.id, req.userEmail);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const note = db.prepare('SELECT * FROM stage_notes WHERE id = ? AND application_id = ?').get(req.params.noteId, req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  const now = new Date().toISOString();
  db.prepare('DELETE FROM stage_notes WHERE id = ?').run(req.params.noteId);
  db.prepare('UPDATE applications SET updated_at = ? WHERE id = ?').run(now, req.params.id);
  res.json({ success: true });
});

module.exports = router;
