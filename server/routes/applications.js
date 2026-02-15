const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');

const router = express.Router();

const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadsDir,
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const VALID_STATUSES = ['interested', 'applied', 'screening', 'interview', 'offer', 'accepted', 'rejected'];

const STATUS_DATE_MAP = {
  applied: 'applied_at',
  screening: 'screening_at',
  interview: 'interview_at',
  offer: 'offer_at',
  accepted: 'closed_at',
  rejected: 'closed_at'
};

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

// List all applications
router.get('/', (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && VALID_STATUSES.includes(status)) {
    rows = db.prepare('SELECT * FROM applications WHERE status = ? ORDER BY updated_at DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM applications ORDER BY updated_at DESC').all();
  }
  res.json(attachNotes(rows));
});

// Get single application
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(attachNotes([row])[0]);
});

// Create application (multipart for CV + cover letter)
router.post('/', upload.fields([{ name: 'cv', maxCount: 1 }, { name: 'cover_letter', maxCount: 1 }]), (req, res) => {
  const { company_name, role_title, status, job_description, job_posting_url, company_website_url, interview_notes, prep_work } = req.body;
  if (!company_name || !role_title) {
    return res.status(400).json({ error: 'company_name and role_title are required' });
  }
  const now = new Date().toISOString();
  const appStatus = status && VALID_STATUSES.includes(status) ? status : 'interested';

  let cv_filename = null;
  let cv_path = null;
  if (req.files?.cv?.[0]) {
    cv_filename = req.files.cv[0].originalname;
    cv_path = req.files.cv[0].filename;
  }

  let cover_letter_filename = null;
  let cover_letter_path = null;
  if (req.files?.cover_letter?.[0]) {
    cover_letter_filename = req.files.cover_letter[0].originalname;
    cover_letter_path = req.files.cover_letter[0].filename;
  }

  const dateField = STATUS_DATE_MAP[appStatus];
  const stmt = db.prepare(`
    INSERT INTO applications (company_name, role_title, status, job_description, job_posting_url, company_website_url,
      cv_filename, cv_path, cover_letter_filename, cover_letter_path, interview_notes, prep_work, created_at, updated_at,
      applied_at, screening_at, interview_at, offer_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    company_name, role_title, appStatus,
    job_description || null, job_posting_url || null, company_website_url || null,
    cv_filename, cv_path, cover_letter_filename, cover_letter_path,
    interview_notes || null, prep_work || null,
    now, now,
    dateField === 'applied_at' ? now : null,
    dateField === 'screening_at' ? now : null,
    dateField === 'interview_at' ? now : null,
    dateField === 'offer_at' ? now : null,
    dateField === 'closed_at' ? now : null
  );

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(row);
});

// Update application fields
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const fields = ['company_name', 'role_title', 'job_description', 'job_posting_url',
    'company_website_url', 'interview_notes', 'prep_work'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(req.params.id);

  db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(row);
});

// Change status
router.patch('/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const now = new Date().toISOString();
  const updates = ['status = ?', 'updated_at = ?'];
  const values = [status, now];

  const dateField = STATUS_DATE_MAP[status];
  if (dateField) {
    updates.push(`${dateField} = ?`);
    values.push(now);
  }

  values.push(req.params.id);
  db.prepare(`UPDATE applications SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(row);
});

// Upload/replace CV
router.post('/:id/cv', upload.single('cv'), (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Remove old file
  if (existing.cv_path) {
    const oldPath = path.join(uploadsDir, existing.cv_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE applications SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id);

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(row);
});

// Download CV
router.get('/:id/cv', (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!existing.cv_path) return res.status(404).json({ error: 'No CV uploaded' });

  const filePath = path.join(uploadsDir, existing.cv_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.download(filePath, existing.cv_filename);
});

// Upload/replace cover letter
router.post('/:id/cover-letter', upload.single('cover_letter'), (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  if (existing.cover_letter_path) {
    const oldPath = path.join(uploadsDir, existing.cover_letter_path);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  db.prepare('UPDATE applications SET cover_letter_filename = ?, cover_letter_path = ?, updated_at = ? WHERE id = ?')
    .run(req.file.originalname, req.file.filename, new Date().toISOString(), req.params.id);

  const row = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  res.json(row);
});

// Download cover letter
router.get('/:id/cover-letter', (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  if (!existing.cover_letter_path) return res.status(404).json({ error: 'No cover letter uploaded' });

  const filePath = path.join(uploadsDir, existing.cover_letter_path);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });

  res.download(filePath, existing.cover_letter_filename);
});

// Delete application
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  if (existing.cv_path) {
    const filePath = path.join(uploadsDir, existing.cv_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  if (existing.cover_letter_path) {
    const filePath = path.join(uploadsDir, existing.cover_letter_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  db.prepare('DELETE FROM applications WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// Create a stage note
router.post('/:id/notes', (req, res) => {
  const existing = db.prepare('SELECT id FROM applications WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { stage, content } = req.body;
  if (!stage || !content) {
    return res.status(400).json({ error: 'stage and content are required' });
  }

  const now = new Date().toISOString();
  const result = db.prepare('INSERT INTO stage_notes (application_id, stage, content, created_at) VALUES (?, ?, ?, ?)')
    .run(req.params.id, stage, content, now);

  const note = db.prepare('SELECT * FROM stage_notes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(note);
});

// Delete a stage note
router.delete('/:id/notes/:noteId', (req, res) => {
  const note = db.prepare('SELECT * FROM stage_notes WHERE id = ? AND application_id = ?').get(req.params.noteId, req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found' });

  db.prepare('DELETE FROM stage_notes WHERE id = ?').run(req.params.noteId);
  res.json({ success: true });
});

module.exports = router;
