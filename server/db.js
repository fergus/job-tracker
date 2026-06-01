const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const dbPath =
    process.env.DB_PATH || path.join(__dirname, "..", "data", "job-tracker.db");

if (dbPath !== ":memory:") {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
const columns = db.prepare("PRAGMA table_info(applications)").all();
if (!columns.some((c) => c.name === "user_email")) {
    db.exec("ALTER TABLE applications ADD COLUMN user_email TEXT");
}

db.exec(
    "CREATE INDEX IF NOT EXISTS idx_applications_user_email ON applications(user_email)",
);
db.exec(
    "CREATE INDEX IF NOT EXISTS idx_applications_user_email_updated_at ON applications(user_email, updated_at)",
);

// Migrate: add interested_at column to applications if missing
const appCols = db.prepare("PRAGMA table_info(applications)").all();
if (!appCols.some((c) => c.name === "interested_at")) {
    db.exec("ALTER TABLE applications ADD COLUMN interested_at TEXT");
    // Backfill: set interested_at = created_at for existing rows
    db.exec(
        "UPDATE applications SET interested_at = created_at WHERE interested_at IS NULL",
    );
}

// Migrate: add updated_at column to stage_notes if missing
const stageNotesCols = db.prepare("PRAGMA table_info(stage_notes)").all();
if (!stageNotesCols.some((c) => c.name === "updated_at")) {
    db.exec("ALTER TABLE stage_notes ADD COLUMN updated_at TEXT");
}

// Migrate: add salary_min, salary_max, job_location columns if missing
const salaryCheck = db.prepare("PRAGMA table_info(applications)").all();
if (!salaryCheck.some((c) => c.name === "salary_min")) {
    db.exec("ALTER TABLE applications ADD COLUMN salary_min INTEGER");
}
if (!salaryCheck.some((c) => c.name === "salary_max")) {
    db.exec("ALTER TABLE applications ADD COLUMN salary_max INTEGER");
}
if (!salaryCheck.some((c) => c.name === "job_location")) {
    db.exec("ALTER TABLE applications ADD COLUMN job_location TEXT");
}

// Migrate: add responded_at column to applications if missing
const respondedCheck = db.prepare("PRAGMA table_info(applications)").all();
if (!respondedCheck.some((c) => c.name === "responded_at")) {
    db.exec("ALTER TABLE applications ADD COLUMN responded_at TEXT");
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

db.exec(
    "CREATE INDEX IF NOT EXISTS idx_attachments_application_id ON attachments(application_id)",
);

// Add text extraction columns to attachments (if not present)
const attachmentCols = db.prepare("PRAGMA table_info(attachments)").all();
if (!attachmentCols.some((c) => c.name === "extracted_text")) {
    db.exec("ALTER TABLE attachments ADD COLUMN extracted_text TEXT");
}
if (!attachmentCols.some((c) => c.name === "extracted_at")) {
    db.exec("ALTER TABLE attachments ADD COLUMN extracted_at TEXT");
}
if (!attachmentCols.some((c) => c.name === "generated_by")) {
    db.exec("ALTER TABLE attachments ADD COLUMN generated_by TEXT");
}
if (!attachmentCols.some((c) => c.name === "generation_task")) {
    db.exec("ALTER TABLE attachments ADD COLUMN generation_task TEXT");
}

// API keys table
db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email TEXT NOT NULL REFERENCES users(email),
    label TEXT,
    key_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_used_at TEXT,
    expires_at TEXT
  )
`);

db.exec(
    "CREATE INDEX IF NOT EXISTS idx_api_keys_user_email ON api_keys(user_email)",
);
db.exec(
    "CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash)",
);

// Migrate: add extracted_jd column to applications if missing
const extractedJdCheck = db.prepare("PRAGMA table_info(applications)").all();
if (!extractedJdCheck.some((c) => c.name === "extracted_jd")) {
    db.exec("ALTER TABLE applications ADD COLUMN extracted_jd TEXT");
}

// Audit log table (activity timeline for all mutations)
db.exec(`
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER REFERENCES applications(id) ON DELETE CASCADE,
    user_email TEXT NOT NULL,
    action TEXT NOT NULL,
    source TEXT NOT NULL,
    auth_method TEXT NOT NULL,
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(
    "CREATE INDEX IF NOT EXISTS idx_audit_log_app_created ON audit_log(application_id, created_at DESC)",
);

// User profiles table (candidate identity, narrative, and agent instructions)
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profiles (
    user_email TEXT PRIMARY KEY REFERENCES users(email),
    full_name TEXT,
    location_city TEXT,
    location_country TEXT,
    target_roles TEXT,
    compensation_currency TEXT,
    compensation_target_range TEXT,
    linkedin_url TEXT,
    portfolio_url TEXT,
    agent_tone TEXT,
    agent_emphasize TEXT,
    agent_avoid TEXT,
    cv_markdown TEXT,
    career_narrative TEXT,
    agent_instructions TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`);

// Upload tokens — short-lived single-use tokens for the pre-signed file upload flow
db.exec(`
  CREATE TABLE IF NOT EXISTS upload_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token TEXT UNIQUE NOT NULL,
    user_email TEXT NOT NULL,
    application_id INTEGER NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

db.exec(
    "CREATE INDEX IF NOT EXISTS idx_upload_tokens_token ON upload_tokens(token)",
);

// Migrations tracking table
db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TEXT)`,
);

// One-shot migration: rename screening status to responded and copy dates
const screeningMigrationRan = db
    .prepare("SELECT 1 FROM _migrations WHERE name = ?")
    .get("screening_to_responded");
if (!screeningMigrationRan) {
    db.transaction(() => {
        db.exec(
            "UPDATE applications SET status = 'responded' WHERE status = 'screening'",
        );
        db.exec(
            "UPDATE applications SET responded_at = screening_at WHERE responded_at IS NULL AND screening_at IS NOT NULL",
        );
        db.prepare(
            "INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
        ).run("screening_to_responded");
    })();
}

// Migrate existing CV/cover-letter data into attachments table
const alreadyRun = db
    .prepare("SELECT 1 FROM _migrations WHERE name = ?")
    .get("cv_to_attachments");
const hasCvData = db
    .prepare(
        "SELECT COUNT(*) as count FROM applications WHERE cv_path IS NOT NULL OR cover_letter_path IS NOT NULL",
    )
    .get();

if (!alreadyRun && hasCvData.count > 0) {
    const uploadsDir = path.join(__dirname, "..", "uploads");

    const MIME_MAP = {
        ".pdf": "application/pdf",
        ".doc": "application/msword",
        ".docx":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };

    // WAL checkpoint before backup for consistency
    db.pragma("wal_checkpoint(TRUNCATE)");
    const backupPath = dbPath + ".pre-attachments.bak";
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(dbPath, backupPath);
    }

    const migrate = db.transaction(() => {
        const apps = db
            .prepare(
                "SELECT id, cv_filename, cv_path, cover_letter_filename, cover_letter_path FROM applications WHERE cv_path IS NOT NULL OR cover_letter_path IS NOT NULL",
            )
            .all();

        for (const app of apps) {
            if (app.cv_path) {
                const filePath = path.join(uploadsDir, app.cv_path);
                if (fs.existsSync(filePath)) {
                    const size = fs.statSync(filePath).size;
                    const ext = path.extname(app.cv_path).toLowerCase();
                    const mime = MIME_MAP[ext] || null;
                    db.prepare(
                        "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type) VALUES (?, ?, ?, ?, ?)",
                    ).run(app.id, app.cv_filename, app.cv_path, size, mime);
                }
            }
            if (app.cover_letter_path) {
                const filePath = path.join(uploadsDir, app.cover_letter_path);
                if (fs.existsSync(filePath)) {
                    const size = fs.statSync(filePath).size;
                    const ext = path
                        .extname(app.cover_letter_path)
                        .toLowerCase();
                    const mime = MIME_MAP[ext] || null;
                    db.prepare(
                        "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type) VALUES (?, ?, ?, ?, ?)",
                    ).run(
                        app.id,
                        app.cover_letter_filename,
                        app.cover_letter_path,
                        size,
                        mime,
                    );
                }
            }
        }

        db.prepare(
            "INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
        ).run("cv_to_attachments");
    });

    migrate();
}

// One-shot migration: backfill extracted_text for existing attachments
const backfillRan = db
    .prepare("SELECT 1 FROM _migrations WHERE name = ?")
    .get("backfill_attachment_text");
if (!backfillRan) {
    (async () => {
        console.log(
            "[backfill] Starting attachment text extraction backfill...",
        );
        const { extractText } = require("./services/extraction");
        const uploadsDir = path.join(__dirname, "..", "uploads");

        const attachments = db
            .prepare(
                "SELECT id, application_id, stored_filename, original_filename, mime_type FROM attachments WHERE extracted_text IS NULL",
            )
            .all();

        if (attachments.length === 0) {
            console.log("[backfill] No attachments need backfill.");
            db.prepare(
                "INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
            ).run("backfill_attachment_text");
            return;
        }

        console.log(
            `[backfill] Found ${attachments.length} attachment(s) without extracted text.`,
        );

        let successCount = 0;
        let failCount = 0;
        let skipCount = 0;
        const now = new Date().toISOString();

        for (const att of attachments) {
            const filePath = path.join(uploadsDir, att.stored_filename);
            if (!fs.existsSync(filePath)) {
                console.error(
                    `[backfill][id=${att.id}] failed reason="file missing on disk" path="${filePath}"`,
                );
                failCount++;
                continue;
            }

            const text = await extractText(filePath, att.mime_type, {
                attachmentId: att.id,
            });

            if (text === null) {
                // Distinguish between "unsupported type" (skip) and "extraction error" (fail)
                const ext = path.extname(filePath).toLowerCase();
                const supportedExts = [".pdf", ".doc", ".docx", ".txt", ".md"];
                if (!supportedExts.includes(ext)) {
                    console.log(
                        `[backfill][id=${att.id}] skipped reason="unsupported extension" filename="${att.original_filename}"`,
                    );
                    skipCount++;
                } else {
                    console.error(
                        `[backfill][id=${att.id}] failed reason="extraction returned null" filename="${att.original_filename}"`,
                    );
                    failCount++;
                }
                // Mark as processed so we don't retry indefinitely; store empty sentinel
                db.prepare(
                    "UPDATE attachments SET extracted_at = ? WHERE id = ?",
                ).run(now, att.id);
            } else {
                db.prepare(
                    "UPDATE attachments SET extracted_text = ?, extracted_at = ? WHERE id = ?",
                ).run(text, now, att.id);
                successCount++;
            }
        }

        db.prepare(
            "INSERT INTO _migrations (name, applied_at) VALUES (?, datetime('now'))",
        ).run("backfill_attachment_text");

        console.log("[backfill] Complete.");
        console.log(
            `[backfill] Summary: total=${attachments.length} success=${successCount} failed=${failCount} skipped=${skipCount}`,
        );
    })();
}

// API key prepared statements
db.insertApiKey = db.prepare(
    `INSERT INTO api_keys (user_email, label, key_hash) VALUES (?, ?, ?)`,
);
db.getApiKeyByHash = db.prepare(
    `SELECT id, user_email FROM api_keys WHERE key_hash = ?`,
);
db.listApiKeysByUser = db.prepare(
    `SELECT id, label, created_at, last_used_at FROM api_keys WHERE user_email = ? ORDER BY created_at ASC`,
);
db.deleteApiKey = db.prepare(
    `DELETE FROM api_keys WHERE id = ? AND user_email = ?`,
);
db.updateApiKeyLastUsed = db.prepare(
    `UPDATE api_keys SET last_used_at = datetime('now') WHERE id = ?`,
);
db.countApiKeysByUser = db.prepare(
    `SELECT COUNT(*) as count FROM api_keys WHERE user_email = ?`,
);

// Audit log prepared statement
db.insertAuditLog = db.prepare(
    `INSERT INTO audit_log (application_id, user_email, action, source, auth_method, details) VALUES (?, ?, ?, ?, ?, ?)`,
);
db.listAuditLogByApp = db.prepare(
    `SELECT * FROM audit_log WHERE application_id = ? ORDER BY created_at DESC, id DESC`,
);

// Orphaned file sweeper: remove files in uploads/ not referenced by DB
function runOrphanedFileSweep() {
    if (dbPath === ":memory:") return;
    const uploadsDir = path.join(__dirname, "..", "uploads");
    if (!fs.existsSync(uploadsDir)) return;

    const referenced = new Set();
    const apps = db
        .prepare("SELECT cv_path, cover_letter_path FROM applications")
        .all();
    for (const app of apps) {
        if (app.cv_path) referenced.add(app.cv_path);
        if (app.cover_letter_path) referenced.add(app.cover_letter_path);
    }
    const attachments = db
        .prepare("SELECT stored_filename FROM attachments")
        .all();
    for (const att of attachments) {
        referenced.add(att.stored_filename);
    }

    const files = fs.readdirSync(uploadsDir);
    let removed = 0;
    for (const file of files) {
        if (!referenced.has(file)) {
            try {
                fs.unlinkSync(path.join(uploadsDir, file));
                removed++;
            } catch (err) {
                console.error(
                    "[cleanup] Failed to remove orphaned file:",
                    file,
                    err.message,
                );
            }
        }
    }
    if (removed > 0) {
        console.log(
            `[cleanup] Removed ${removed} orphaned file(s) from uploads/`,
        );
    }
}

runOrphanedFileSweep();

module.exports = db;
