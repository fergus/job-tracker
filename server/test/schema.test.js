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

describe("U3 backfill gating and apply", () => {
    // Seeds one record per derivation rule so the apply can be checked end to end.
    function seedFixture(dbPath) {
        const seed = new Database(dbPath);
        seed.exec(PRE_PLAN_SCHEMA);
        const insert = seed.prepare(
            `INSERT INTO applications
             (company_name, role_title, status, created_at, updated_at,
              interested_at, applied_at, interview_at, offer_at, closed_at, user_email)
             VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)`,
        );
        insert.run("Real Rejection", "Engineer", "rejected", "2026-01-01", "2026-01-02", "2026-01-10", null, "2026-01-20", "dev@localhost");
        insert.run("Never Applied", "Engineer", "rejected", "2026-01-01", null, null, null, "2026-01-20", "dev@localhost");
        insert.run("Accepted", "Engineer", "accepted", "2026-01-01", "2026-01-02", null, "2026-01-15", "2026-01-16", "dev@localhost");
        insert.run("Open", "Engineer", "applied", "2026-01-01", "2026-01-02", null, null, null, "dev@localhost");
        seed.close();
    }

    function snapshot(dbPath) {
        const db = new Database(dbPath, { readonly: true });
        const rows = db
            .prepare("SELECT * FROM applications ORDER BY id")
            .all()
            .map((r) => JSON.stringify(r));
        db.close();
        return rows;
    }

    test("leaves every row unchanged when the opt-in is unset", () => {
        // Covers AE5.
        const dbPath = makeDbPath("gate-unset");
        seedFixture(dbPath);
        bootStartup(dbPath);
        const before = snapshot(dbPath);

        bootStartup(dbPath);
        assert.deepEqual(snapshot(dbPath), before);

        const db = new Database(dbPath, { readonly: true });
        const stages = db
            .prepare("SELECT COUNT(*) c FROM applications WHERE stage IS NOT NULL")
            .get().c;
        assert.equal(stages, 0, "report mode must not write derived values");
        db.close();
    });

    test("writes a report to disk in report mode", () => {
        const dbPath = makeDbPath("gate-report");
        seedFixture(dbPath);
        bootStartup(dbPath);

        const reportPath = path.join(
            path.dirname(dbPath),
            "schema-backfill-report.json",
        );
        assert.ok(fs.existsSync(reportPath), "expected a report file");
        const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        assert.equal(report.summary.total, 4);
        assert.equal(report.summary.flagged, 1);
    });

    test("treats an unrecognised opt-in value as report mode", () => {
        const dbPath = makeDbPath("gate-bogus");
        seedFixture(dbPath);
        bootStartup(dbPath, { SCHEMA_BACKFILL: "yes-please" });

        const db = new Database(dbPath, { readonly: true });
        const stages = db
            .prepare("SELECT COUNT(*) c FROM applications WHERE stage IS NOT NULL")
            .get().c;
        assert.equal(stages, 0);
        db.close();
    });

    test("derives every record when the opt-in is set", () => {
        // Covers AE2, AE3, AE4, AE11.
        const dbPath = makeDbPath("gate-apply");
        seedFixture(dbPath);
        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const byCompany = Object.fromEntries(
            db
                .prepare("SELECT * FROM applications")
                .all()
                .map((r) => [r.company_name, r]),
        );

        assert.deepEqual(
            {
                stage: byCompany["Real Rejection"].stage,
                state: byCompany["Real Rejection"].state,
                close_reason: byCompany["Real Rejection"].close_reason,
                record_type: byCompany["Real Rejection"].record_type,
            },
            {
                stage: "interview",
                state: "closed",
                close_reason: "rejected",
                record_type: "application",
            },
        );

        assert.deepEqual(
            {
                stage: byCompany["Never Applied"].stage,
                close_reason: byCompany["Never Applied"].close_reason,
                record_type: byCompany["Never Applied"].record_type,
            },
            {
                stage: "interested",
                close_reason: "unresolved",
                record_type: "lead",
            },
        );

        assert.equal(byCompany["Accepted"].stage, "offer");
        assert.equal(byCompany["Accepted"].close_reason, "accepted");
        assert.equal(byCompany["Open"].state, "open");
        assert.equal(byCompany["Open"].close_reason, null);
        db.close();
    });

    test("applies once and is a no-op on the next startup", () => {
        const dbPath = makeDbPath("gate-once");
        seedFixture(dbPath);
        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });
        const after = snapshot(dbPath);

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });
        assert.deepEqual(snapshot(dbPath), after);

        const db = new Database(dbPath, { readonly: true });
        const runs = db
            .prepare("SELECT COUNT(*) c FROM _migrations WHERE name = ?")
            .get("status_split_backfill").c;
        assert.equal(runs, 1);
        db.close();
    });

    test("leaves a record an earlier partial run already derived", () => {
        const dbPath = makeDbPath("gate-resume");
        seedFixture(dbPath);
        bootStartup(dbPath);

        // Simulate an interrupted apply: one record derived, migration unrecorded.
        const pre = new Database(dbPath);
        pre.prepare(
            "UPDATE applications SET stage = 'offer', state = 'closed', close_reason = 'withdrawn', record_type = 'application' WHERE company_name = 'Real Rejection'",
        ).run();
        pre.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const row = db
            .prepare("SELECT * FROM applications WHERE company_name = 'Real Rejection'")
            .get();
        assert.equal(row.close_reason, "withdrawn", "resume must not overwrite");
        const remaining = db
            .prepare("SELECT COUNT(*) c FROM applications WHERE stage IS NULL")
            .get().c;
        assert.equal(remaining, 0, "the rest should still have been derived");
        db.close();
    });

    test("does not overwrite a record the operator closed during the report window", () => {
        // The app stays writable between report mode and apply. A record closed
        // through the new shape has state and close_reason but no stage; keying
        // resume on stage alone would let the backfill infer a rejection over
        // the reason the operator actually chose.
        const dbPath = makeDbPath("gate-live-close");
        seedFixture(dbPath);
        bootStartup(dbPath);

        const live = new Database(dbPath);
        live.prepare(
            `UPDATE applications
             SET state = 'closed', close_reason = 'withdrawn', status = 'rejected'
             WHERE company_name = 'Open'`,
        ).run();
        live.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const row = db
            .prepare("SELECT * FROM applications WHERE company_name = 'Open'")
            .get();
        assert.equal(
            row.close_reason,
            "withdrawn",
            "the operator's reason must survive the backfill",
        );
        db.close();
    });

    test("does not strand a record that received a stage before the apply", () => {
        const dbPath = makeDbPath("gate-live-stage");
        seedFixture(dbPath);
        bootStartup(dbPath);

        const live = new Database(dbPath);
        live.prepare(
            "UPDATE applications SET stage = 'interested' WHERE company_name = 'Never Applied'",
        ).run();
        live.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const row = db
            .prepare("SELECT * FROM applications WHERE company_name = 'Never Applied'")
            .get();
        // The row is excluded from the backfill by design, but it must not be
        // silently left half-derived without anyone noticing.
        assert.equal(row.stage, "interested");
        const stranded = db
            .prepare(
                "SELECT COUNT(*) c FROM applications WHERE stage IS NOT NULL AND state IS NULL",
            )
            .get().c;
        assert.equal(
            stranded,
            1,
            "a partially-written row stays visible as partially written",
        );
        db.close();
    });

    test("does not mark the migration complete while records remain unclassified", () => {
        const dbPath = makeDbPath("gate-incomplete");
        seedFixture(dbPath);
        const seed = new Database(dbPath);
        seed.prepare(
            `INSERT INTO applications (company_name, role_title, status, created_at, updated_at, user_email)
             VALUES ('Odd Status', 'Engineer', 'on_hold', datetime('now'), datetime('now'), 'dev@localhost')`,
        ).run();
        seed.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const recorded = db
            .prepare("SELECT COUNT(*) c FROM _migrations WHERE name = ?")
            .get("status_split_backfill").c;
        assert.equal(
            recorded,
            0,
            "recording it would gate the block off and strand the skipped row forever",
        );
        // The classifiable rows were still written.
        const written = db
            .prepare("SELECT COUNT(*) c FROM applications WHERE stage IS NOT NULL")
            .get().c;
        assert.equal(written, 4);
        db.close();
    });

    test("finishes the migration once the odd statuses are fixed", () => {
        const dbPath = makeDbPath("gate-retry");
        seedFixture(dbPath);
        const seed = new Database(dbPath);
        seed.prepare(
            `INSERT INTO applications (company_name, role_title, status, created_at, updated_at, user_email)
             VALUES ('Odd Status', 'Engineer', 'on_hold', datetime('now'), datetime('now'), 'dev@localhost')`,
        ).run();
        seed.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const fix = new Database(dbPath);
        fix.prepare(
            "UPDATE applications SET status = 'interested' WHERE company_name = 'Odd Status'",
        ).run();
        fix.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const remaining = db
            .prepare("SELECT COUNT(*) c FROM applications WHERE stage IS NULL")
            .get().c;
        assert.equal(remaining, 0);
        const recorded = db
            .prepare("SELECT COUNT(*) c FROM _migrations WHERE name = ?")
            .get("status_split_backfill").c;
        assert.equal(recorded, 1);
        db.close();
    });

    test("skips a record whose status it does not understand", () => {
        const dbPath = makeDbPath("gate-unknown");
        seedFixture(dbPath);
        const seed = new Database(dbPath);
        seed.prepare(
            `INSERT INTO applications (company_name, role_title, status, created_at, updated_at, user_email)
             VALUES ('Odd One', 'Engineer', 'on_hold', datetime('now'), datetime('now'), 'dev@localhost')`,
        ).run();
        seed.close();

        bootStartup(dbPath, { SCHEMA_BACKFILL: "apply" });

        const db = new Database(dbPath, { readonly: true });
        const row = db
            .prepare("SELECT * FROM applications WHERE company_name = 'Odd One'")
            .get();
        assert.equal(row.stage, null, "an unknown status must not be guessed at");
        assert.equal(row.status, "on_hold", "and must be left alone");
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
