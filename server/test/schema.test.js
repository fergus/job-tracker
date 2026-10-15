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

// Columns added to applications after the pre-plan shape above.
const APPLICATION_COLUMNS = [
    "stage",
    "state",
    "close_reason",
    "record_type",
    "next_action_at",
];

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
                // db.js runs a destructive orphaned-file sweep on startup that
                // deletes anything in the uploads dir not referenced by ITS
                // database. These boots use throwaway databases, so without an
                // override they would wipe the real uploads directory shared
                // with the other test files running in parallel. A caller may
                // override it, so this is a default and must precede ...env.
                UPLOADS_DIR: path.join(tmpDir, "uploads"),
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
    fs.mkdirSync(path.join(tmpDir, "uploads"), { recursive: true });
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
        for (const col of APPLICATION_COLUMNS) {
            assert.ok(appCols.includes(col), `applications is missing ${col}`);
        }

        const indexes = db
            .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
            .all()
            .map((r) => r.name);
        assert.ok(
            indexes.includes("idx_applications_next_action"),
            "missing the follow-up date index",
        );

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
        for (const col of APPLICATION_COLUMNS) {
            assert.ok(appCols.includes(col), `applications is missing ${col}`);
        }

        const row = db.prepare("SELECT * FROM applications WHERE id = 1").get();
        assert.equal(row.company_name, "Acme Corp");
        assert.equal(row.role_title, "Engineer");
        assert.equal(row.status, "rejected");
        assert.equal(row.applied_at, "2026-01-01T00:00:00.000Z");
        assert.equal(row.updated_at, "2026-01-02T00:00:00.000Z");
        assert.equal(row.next_action_at, null, "no follow-up is invented for old rows");
        db.close();
    });

    test("is idempotent across repeated startups", () => {
        const dbPath = makeDbPath("twice");
        bootStartup(dbPath);
        // A second boot must not throw on duplicate columns or tables.
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        const appCols = columnsOf(db, "applications");
        for (const col of APPLICATION_COLUMNS) {
            assert.equal(
                appCols.filter((c) => c === col).length,
                1,
                `${col} was added more than once`,
            );
        }
        db.close();
    });
});

describe("note hiding and edit columns", () => {
    // The pre-plan shape of the two note tables, as they stood before notes
    // could be hidden. contact_notes is declared without its foreign key so the
    // seed does not have to reproduce the contacts DDL db.js owns.
    const PRE_HIDE_NOTES_SCHEMA = `
      CREATE TABLE contact_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `;

    test("adds the hidden column to both note tables on an empty database", () => {
        const dbPath = makeDbPath("note-hide-empty");
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        assert.ok(
            columnsOf(db, "stage_notes").includes("hidden_at"),
            "stage_notes is missing hidden_at",
        );
        assert.ok(
            columnsOf(db, "contact_notes").includes("hidden_at"),
            "contact_notes is missing hidden_at",
        );
        db.close();
    });

    test("adds updated_at to contact_notes so an edit is distinguishable", () => {
        const dbPath = makeDbPath("note-edit-empty");
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        assert.ok(
            columnsOf(db, "contact_notes").includes("updated_at"),
            "contact_notes is missing updated_at",
        );
        db.close();
    });

    test("leaves notes written before the migration visible", () => {
        const dbPath = makeDbPath("note-hide-pre");
        const seed = new Database(dbPath);
        seed.exec(PRE_PLAN_SCHEMA);
        seed.exec(PRE_HIDE_NOTES_SCHEMA);
        seed.prepare(
            `INSERT INTO applications
             (company_name, role_title, status, created_at, updated_at, user_email)
             VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
            "Acme Corp",
            "Engineer",
            "applied",
            "2026-01-01T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
            "dev@localhost",
        );
        seed.prepare(
            `INSERT INTO stage_notes (application_id, stage, content, created_at)
             VALUES (1, 'applied', 'older stage note', '2026-01-01T00:00:00.000Z')`,
        ).run();
        seed.prepare(
            `INSERT INTO contact_notes (contact_id, content, occurred_at, created_at)
             VALUES (1, 'older interaction', '2026-01-01', '2026-01-01T00:00:00.000Z')`,
        ).run();
        seed.close();

        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        const stageNote = db.prepare("SELECT * FROM stage_notes WHERE id = 1").get();
        assert.equal(stageNote.content, "older stage note");
        assert.equal(stageNote.hidden_at, null, "an old stage note must not arrive hidden");

        const interaction = db.prepare("SELECT * FROM contact_notes WHERE id = 1").get();
        assert.equal(interaction.content, "older interaction");
        assert.equal(interaction.hidden_at, null, "an old interaction must not arrive hidden");
        assert.equal(interaction.updated_at, null, "an unedited interaction has no edit stamp");
        db.close();
    });

    test("is idempotent across repeated startups", () => {
        const dbPath = makeDbPath("note-hide-twice");
        bootStartup(dbPath);
        bootStartup(dbPath);

        const db = new Database(dbPath, { readonly: true });
        for (const [table, col] of [
            ["stage_notes", "hidden_at"],
            ["contact_notes", "hidden_at"],
            ["contact_notes", "updated_at"],
        ]) {
            assert.equal(
                columnsOf(db, table).filter((c) => c === col).length,
                1,
                `${table}.${col} was added more than once`,
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

describe("startup never sweeps an uploads directory it was not pointed at", () => {
    // Regression: db.js's orphaned-file sweep used a hardcoded shared path, so
    // any boot against a throwaway database deleted the real uploads directory's
    // contents. Under a parallel test runner that raced other suites' fixtures;
    // aimed at the wrong directory in production it would delete real files.
    test("a boot with UPLOADS_DIR set leaves other directories untouched", () => {
        const dbPath = makeDbPath("sweep-scope");
        const ownUploads = path.join(tmpDir, "sweep-own");
        const foreignUploads = path.join(tmpDir, "sweep-foreign");
        fs.mkdirSync(ownUploads, { recursive: true });
        fs.mkdirSync(foreignUploads, { recursive: true });

        const orphan = path.join(ownUploads, "orphan.txt");
        const bystander = path.join(foreignUploads, "bystander.txt");
        fs.writeFileSync(orphan, "unreferenced");
        fs.writeFileSync(bystander, "belongs to someone else");

        bootStartup(dbPath, { UPLOADS_DIR: ownUploads });

        assert.equal(
            fs.existsSync(orphan),
            false,
            "the sweep should still clean the directory it was pointed at",
        );
        assert.equal(
            fs.existsSync(bystander),
            true,
            "and must not touch any other uploads directory",
        );
    });
});
