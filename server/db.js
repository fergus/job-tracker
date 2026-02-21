const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'job-tracker.db'));

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

module.exports = db;
