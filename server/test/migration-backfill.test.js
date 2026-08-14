"use strict";

process.env.DB_PATH = ":memory:";

const { test, describe, before } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
    deriveRecord,
    buildReport,
    findPersonCandidates,
} = require("../services/migration-backfill");

// A row as it exists before the backfill: legacy status plus stage dates.
function row(overrides = {}) {
    return {
        id: 1,
        company_name: "Acme Corp",
        role_title: "Engineer",
        status: "interested",
        job_posting_url: "https://example.com/job/1",
        prep_work: null,
        interested_at: "2026-01-01T00:00:00.000Z",
        applied_at: null,
        responded_at: null,
        screening_at: null,
        interview_at: null,
        offer_at: null,
        closed_at: null,
        ...overrides,
    };
}

describe("U2 stage, state and close_reason derivation", () => {
    test("a rejected record with an interview date derives interview/closed/rejected", () => {
        // Covers AE3.
        const d = deriveRecord(
            row({
                status: "rejected",
                applied_at: "2026-01-02T00:00:00.000Z",
                interview_at: "2026-01-10T00:00:00.000Z",
                closed_at: "2026-01-20T00:00:00.000Z",
            }),
        );
        assert.equal(d.stage, "interview");
        assert.equal(d.state, "closed");
        assert.equal(d.close_reason, "rejected");
        assert.equal(d.review, false);
    });

    test("a rejected record with no progress derives interested/closed/unresolved and is flagged", () => {
        // Covers AE2. This is the ~82-record case: closed out as rejected
        // because rejected was the only close state available.
        const d = deriveRecord(
            row({ status: "rejected", closed_at: "2026-01-20T00:00:00.000Z" }),
        );
        assert.equal(d.stage, "interested");
        assert.equal(d.state, "closed");
        assert.equal(d.close_reason, "unresolved");
        assert.equal(d.record_type, "lead");
        assert.equal(d.review, true);
    });

    test("an accepted record derives offer/closed/accepted", () => {
        // Covers AE4.
        const d = deriveRecord(
            row({
                status: "accepted",
                applied_at: "2026-01-02T00:00:00.000Z",
                offer_at: "2026-01-15T00:00:00.000Z",
                closed_at: "2026-01-16T00:00:00.000Z",
            }),
        );
        assert.equal(d.stage, "offer");
        assert.equal(d.state, "closed");
        assert.equal(d.close_reason, "accepted");
    });

    test("each open status derives its own stage, open state, and no close reason", () => {
        for (const status of [
            "interested",
            "applied",
            "responded",
            "interview",
            "offer",
        ]) {
            const d = deriveRecord(row({ status }));
            assert.equal(d.stage, status, `stage for ${status}`);
            assert.equal(d.state, "open", `state for ${status}`);
            assert.equal(d.close_reason, null, `close_reason for ${status}`);
        }
    });

    test("a later stage date outranks a missing earlier one", () => {
        const d = deriveRecord(
            row({ status: "rejected", interview_at: "2026-01-10T00:00:00.000Z" }),
        );
        assert.equal(d.stage, "interview");
        assert.equal(d.close_reason, "rejected");
    });

    test("screening_at counts as a responded-stage signal", () => {
        // screening_at is vestigial: the screening_to_responded migration
        // renamed the status but left the column behind.
        const d = deriveRecord(
            row({ status: "rejected", screening_at: "2026-01-05T00:00:00.000Z" }),
        );
        assert.equal(d.stage, "responded");
    });

    test("a record with no stage dates and interested status derives interested and is not flagged", () => {
        const d = deriveRecord(row({ status: "interested", interested_at: null }));
        assert.equal(d.stage, "interested");
        assert.equal(d.review, false);
    });

    test("an unknown status is flagged rather than derived", () => {
        const d = deriveRecord(row({ status: "on_hold" }));
        assert.equal(d.review, true);
        assert.equal(d.rule, "unknown_status");
        assert.equal(d.stage, null);
        assert.equal(d.state, null);
    });
});

describe("U2 record_type derivation", () => {
    test("a rejected record with an application date is an application", () => {
        // Covers AE11.
        const d = deriveRecord(
            row({ status: "rejected", applied_at: "2026-01-02T00:00:00.000Z" }),
        );
        assert.equal(d.record_type, "application");
    });

    test("an open record with no application date and no later stage date is a lead", () => {
        // Classification does not depend on the record being closed.
        const d = deriveRecord(row({ status: "interested" }));
        assert.equal(d.record_type, "lead");
    });

    test("a status beyond interested counts as progress even with no stage dates", () => {
        // The status is evidence too: an accepted record was applied to,
        // whether or not anyone stamped the date.
        const d = deriveRecord(
            row({
                status: "accepted",
                interested_at: null,
                applied_at: null,
                offer_at: null,
            }),
        );
        assert.equal(d.record_type, "application");
    });
});

describe("U2 person-row candidates", () => {
    test("an empty role_title plus a phone in prep_work is a candidate", () => {
        const candidates = findPersonCandidates([
            row({
                id: 148,
                company_name: "Mike Carter",
                role_title: "",
                prep_work: "Mobile 0412 345 678, best after 5pm",
                job_posting_url: null,
            }),
        ]);
        assert.equal(candidates.length, 1);
        assert.equal(candidates[0].id, 148);
        assert.ok(candidates[0].reasons.length >= 2);
    });

    test("a normal application row with a posting url is not a candidate", () => {
        const candidates = findPersonCandidates([row()]);
        assert.equal(candidates.length, 0);
    });

    test("a single weak signal is not enough to flag a row", () => {
        // No posting url alone describes plenty of legitimate records.
        const candidates = findPersonCandidates([row({ job_posting_url: null })]);
        assert.equal(candidates.length, 0);
    });
});

describe("U2 report mode", () => {
    let db;
    let tmpDir;

    before(() => {
        db = require("../db");
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jt-report-"));
        const insert = db.prepare(
            `INSERT INTO applications
             (company_name, role_title, status, created_at, updated_at,
              interested_at, applied_at, interview_at, closed_at, user_email)
             VALUES (?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?)`,
        );
        // Three shapes: a real rejection, a never-applied lead, and an open record.
        insert.run(
            "Real Rejection",
            "Engineer",
            "rejected",
            "2026-01-01",
            "2026-01-02",
            "2026-01-10",
            "2026-01-20",
            "dev@localhost",
        );
        insert.run(
            "Never Applied",
            "Engineer",
            "rejected",
            "2026-01-01",
            null,
            null,
            "2026-01-20",
            "dev@localhost",
        );
        insert.run(
            "Still Open",
            "Engineer",
            "applied",
            "2026-01-01",
            "2026-01-02",
            null,
            null,
            "dev@localhost",
        );
    });

    test("summary counts sum to the record total", () => {
        const report = buildReport(db);
        const byReason = Object.values(report.summary.by_close_reason).reduce(
            (a, b) => a + b,
            0,
        );
        const byType = Object.values(report.summary.by_record_type).reduce(
            (a, b) => a + b,
            0,
        );
        const byRule = Object.values(report.summary.by_rule).reduce(
            (a, b) => a + b,
            0,
        );
        assert.equal(report.summary.total, report.records.length);
        assert.equal(byReason, report.summary.total);
        assert.equal(byType, report.summary.total);
        assert.equal(byRule, report.summary.total);
    });

    test("report mode leaves every row byte-identical", () => {
        // Covers AE5.
        const before = db
            .prepare("SELECT * FROM applications ORDER BY id")
            .all()
            .map((r) => JSON.stringify(r));

        buildReport(db, { reportPath: path.join(tmpDir, "report.json") });

        const after = db
            .prepare("SELECT * FROM applications ORDER BY id")
            .all()
            .map((r) => JSON.stringify(r));
        assert.deepEqual(after, before);
    });

    test("writes the report to disk when a path is given", () => {
        const reportPath = path.join(tmpDir, "written.json");
        buildReport(db, { reportPath });

        assert.ok(fs.existsSync(reportPath));
        const parsed = JSON.parse(fs.readFileSync(reportPath, "utf8"));
        assert.equal(parsed.summary.total, 3);
        assert.ok(Array.isArray(parsed.records));
    });

    test("classifies the seeded shapes as expected", () => {
        const report = buildReport(db);
        const byCompany = Object.fromEntries(
            report.records.map((r) => [r.company_name, r]),
        );

        assert.equal(byCompany["Real Rejection"].derived.close_reason, "rejected");
        assert.equal(byCompany["Real Rejection"].derived.record_type, "application");

        assert.equal(byCompany["Never Applied"].derived.close_reason, "unresolved");
        assert.equal(byCompany["Never Applied"].derived.record_type, "lead");
        assert.equal(byCompany["Never Applied"].review, true);

        assert.equal(byCompany["Still Open"].derived.state, "open");
        assert.equal(byCompany["Still Open"].derived.close_reason, null);
    });
});
