const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'job-tracker.db');

if (dbPath !== ':memory:') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT NOT NULL,
    role_title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'interested',
    job_description TEXT,
    job_posting_url TEXT,
    company_website_url TEXT,
    cv_filename TEXT,
    cv_path TEXT,
    cover_letter_filename TEXT,
    cover_letter_path TEXT,
    interview_notes TEXT,
    prep_work TEXT,
    created_at TEXT NOT NULL,
    applied_at TEXT,
    screening_at TEXT,
    interview_at TEXT,
    offer_at TEXT,
    closed_at TEXT,
    updated_at TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS stage_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    stage TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  )
`);

// Migrate: add user_email column to applications if missing
const columns = db.prepare('PRAGMA table_info(applications)').all();
if (!columns.some(c => c.name === 'user_email')) {
  db.exec('ALTER TABLE applications ADD COLUMN user_email TEXT');
}

db.exec('CREATE INDEX IF NOT EXISTS idx_applications_user_email ON applications(user_email)');

// Migrate: add interested_at column to applications if missing
const appCols = db.prepare('PRAGMA table_info(applications)').all();
if (!appCols.some(c => c.name === 'interested_at')) {
  db.exec('ALTER TABLE applications ADD COLUMN interested_at TEXT');
  // Backfill: set interested_at = created_at for existing rows
  db.exec('UPDATE applications SET interested_at = created_at WHERE interested_at IS NULL');
}

// Migrate: add updated_at column to stage_notes if missing
const stageNotesCols = db.prepare('PRAGMA table_info(stage_notes)').all();
if (!stageNotesCols.some(c => c.name === 'updated_at')) {
  db.exec('ALTER TABLE stage_notes ADD COLUMN updated_at TEXT');
}

// Migrate: add salary_min, salary_max, job_location columns if missing
const salaryCheck = db.prepare('PRAGMA table_info(applications)').all();
if (!salaryCheck.some(c => c.name === 'salary_min')) {
  db.exec('ALTER TABLE applications ADD COLUMN salary_min INTEGER');
}
if (!salaryCheck.some(c => c.name === 'salary_max')) {
  db.exec('ALTER TABLE applications ADD COLUMN salary_max INTEGER');
}
if (!salaryCheck.some(c => c.name === 'job_location')) {
  db.exec('ALTER TABLE applications ADD COLUMN job_location TEXT');
}

// Attachments table (generic file attachments, replaces CV/cover-letter-specific slots)
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    original_filename TEXT NOT NULL,
    stored_filename TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    mime_type TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  )
`);

db.exec('CREATE INDEX IF NOT EXISTS idx_attachments_application_id ON attachments(application_id)');

// Migrations tracking table
db.exec(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)`);

// Migrate existing CV/cover-letter data into attachments table
const alreadyRun = db.prepare("SELECT 1 FROM _migrations WHERE name = ?").get('cv_to_attachments');
const hasCvData = db.prepare("SELECT COUNT(*) as count FROM applications WHERE cv_path IS NOT NULL OR cover_letter_path IS NOT NULL").get();

if (!alreadyRun && hasCvData.count > 0) {
  const uploadsDir = path.join(__dirname, '..', 'uploads');

  const MIME_MAP = {
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };

  // WAL checkpoint before backup for consistency
  db.pragma('wal_checkpoint(TRUNCATE)');
  const backupPath = dbPath + '.pre-attachments.bak';
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(dbPath, backupPath);
  }

  const migrate = db.transaction(() => {
    const apps = db.prepare(
      "SELECT id, cv_filename, cv_path, cover_letter_filename, cover_letter_path FROM applications WHERE cv_path IS NOT NULL OR cover_letter_path IS NOT NULL"
    ).all();

    for (const app of apps) {
      if (app.cv_path) {
        const filePath = path.join(uploadsDir, app.cv_path);
        if (fs.existsSync(filePath)) {
          const size = fs.statSync(filePath).size;
          const ext = path.extname(app.cv_path).toLowerCase();
          const mime = MIME_MAP[ext] || null;
          db.prepare("INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type) VALUES (?, ?, ?, ?, ?)")
            .run(app.id, app.cv_filename, app.cv_path, size, mime);
        }
      }
      if (app.cover_letter_path) {
        const filePath = path.join(uploadsDir, app.cover_letter_path);
        if (fs.existsSync(filePath)) {
          const size = fs.statSync(filePath).size;
          const ext = path.extname(app.cover_letter_path).toLowerCase();
          const mime = MIME_MAP[ext] || null;
          db.prepare("INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type) VALUES (?, ?, ?, ?, ?)")
            .run(app.id, app.cover_letter_filename, app.cover_letter_path, size, mime);
        }
      }
    }

    db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))").run('cv_to_attachments');
  });

  migrate();
}

module.exports = db;
