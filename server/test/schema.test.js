"use strict";

// Schema migration tests (U1). These exercise startup against a real file
// database rather than :memory:, because the point of the unit is that an
// existing pre-plan database gains the new columns and tables on boot.

const { test, describe, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const Database = require("better-sqlite3");

let tmpDir;

// The pre-plan schema: applications as it stood before the status split, plus
// the tables db.js expects to already exist. Deliberately not a copy of the
// current CREATE TABLE — it must be the *old* shape for the migration to have
// anything to do.
const PRE_PLAN_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    first_seen_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
  CREATE TABLE applications (
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
    updated_at TEXT NOT NULL,
    user_email TEXT,
    interested_at TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    job_location TEXT,
    responded_at TEXT,
    extracted_jd TEXT
  );
  CREATE TABLE stage_notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    application_id INTEGER NOT NULL,
    stage TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
  );
`;

function makeDbPath(name) {
    return path.join(tmpDir, `${name}.db`);
}

// Boot db.js in a child process against dbPath. Returns nothing; throws with
// the child's stderr attached if startup fails.
function bootStartup(dbPath, env = {}) {
    return execFileSync(
        process.execPath,
        ["-e", 'require(process.env.DB_MODULE); process.exit(0);'],
        {
            env: {
                ...process.env,
                ...env,
                DB_PATH: dbPath,
                DB_MODULE: path.join(__dirname, "..", "db.js"),
            },
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
        },
    );
}

function columnsOf(db, table) {
    return db
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);
}

function tablesOf(db) {
    return db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => r.name);
}

before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-schema-"));
});

after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("U1 schema migration", () => {
    test("creates every new column and table on an empty database", () => {
        const dbPath = makeDbPath("empty");
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        const appCols = columnsOf(db, "applications");
        for (const col of ["stage", "state", "close_reason", "record_type"]) {
            assert.ok(appCols.includes(col), `applications is missing ${col}`);
        }

        const tables = tablesOf(db);
        for (const t of ["contacts", "contact_links", "_row_backups"]) {
            assert.ok(tables.includes(t), `missing table ${t}`);
        }
        db.close();
    });

    test("adds the columns to a pre-plan database without disturbing existing rows", () => {
        const dbPath = makeDbPath("pre-plan");
        const seed = new Database(dbPath);
        seed.exec(PRE_PLAN_SCHEMA);
        seed.prepare(
            `INSERT INTO applications
             (company_name, role_title, status, created_at, updated_at, applied_at, user_email)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            "Acme Corp",
            "Engineer",
            "rejected",
            "2026-01-01T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "dev@localhost",
        );
        seed.close();

        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        const appCols = columnsOf(db, "applications");
        for (const col of ["stage", "state", "close_reason", "record_type"]) {
            assert.ok(appCols.includes(col), `applications is missing ${col}`);
        }

        const row = db.prepare("SELECT * FROM applications WHERE id = 1").get();
        assert.equal(row.company_name, "Acme Corp");
        assert.equal(row.role_title, "Engineer");
        assert.equal(row.status, "rejected");
        assert.equal(row.applied_at, "2026-01-01T00:00:00.000Z");
        db.close();
    });

    test("is idempotent across repeated startups", () => {
        const dbPath = makeDbPath("twice");
        bootStartup(dbPath);
        // A second boot must not throw on duplicate columns or tables.
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        const appCols = columnsOf(db, "applications");
        for (const col of ["stage", "state", "close_reason", "record_type"]) {
            assert.equal(
                appCols.filter((c) => c === col).length,
                1,
                `${col} was added more than once`,
            );
        }
        db.close();
    });
});

describe("U1 contact_links integrity", () => {
    let dbPath;
    let db;

    before(() => {
        dbPath = makeDbPath("links");
        bootStartup(dbPath);
        db = new Database(dbPath);
        db.pragma("foreign_keys = ON");
    });

    after(() => {
        if (db) db.close();
    });

    function seedPair(suffix) {
        const appId = db
            .prepare(
                `INSERT INTO applications (company_name, role_title, created_at, updated_at, user_email)
                 VALUES (?, ?, datetime('now'), datetime('now'), ?)`,
            )
            .run(`Co ${suffix}`, "Engineer", "dev@localhost").lastInsertRowid;
        const contactId = db
            .prepare(
                "INSERT INTO contacts (name, user_email) VALUES (?, ?)",
            )
            .run(`Person ${suffix}`, "dev@localhost").lastInsertRowid;
        db.prepare(
            "INSERT INTO contact_links (contact_id, application_id, relation) VALUES (?, ?, ?)",
        ).run(contactId, appId, "recruiter");
        return { appId, contactId };
    }

    test("deleting an application removes its links and keeps the contact", () => {
        const { appId, contactId } = seedPair("a");
        db.prepare("DELETE FROM applications WHERE id = ?").run(appId);

        const links = db
            .prepare("SELECT COUNT(*) c FROM contact_links WHERE application_id = ?")
            .get(appId).c;
        assert.equal(links, 0);

        const contact = db
            .prepare("SELECT * FROM contacts WHERE id = ?")
            .get(contactId);
        assert.ok(contact, "contact should survive the application delete");
    });

    test("deleting a contact removes its links and keeps the application", () => {
        const { appId, contactId } = seedPair("b");
        db.prepare("DELETE FROM contacts WHERE id = ?").run(contactId);

        const links = db
            .prepare("SELECT COUNT(*) c FROM contact_links WHERE contact_id = ?")
            .get(contactId).c;
        assert.equal(links, 0);

        const application = db
            .prepare("SELECT * FROM applications WHERE id = ?")
            .get(appId);
        assert.ok(application, "application should survive the contact delete");
    });

    test("rejects a duplicate contact/application pair", () => {
        const { appId, contactId } = seedPair("c");
        assert.throws(
            () =>
                db
                    .prepare(
                        "INSERT INTO contact_links (contact_id, application_id) VALUES (?, ?)",
                    )
                    .run(contactId, appId),
            /UNIQUE/i,
        );
    });
});
