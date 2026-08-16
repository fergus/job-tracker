"use strict";

// Derivation for the one-shot backfill that splits the overloaded `status`
// column into stage / state / close_reason and separates applications from
// leads. Pure functions plus a report builder — nothing here writes to the
// database. The apply path in db.js reuses deriveRecord so the report can
// never drift from what the apply does.

const fs = require("fs");
const path = require("path");

// Ordered lowest to highest. A record's stage is the furthest of these for
// which it carries evidence.
const STAGE_ORDER = ["interested", "applied", "responded", "interview", "offer"];

// screening_at is vestigial: the screening_to_responded migration renamed the
// status but left the column in place, so it still carries responded evidence.
const STAGE_DATE_COLUMNS = {
    interested: ["interested_at"],
    applied: ["applied_at"],
    responded: ["responded_at", "screening_at"],
    interview: ["interview_at"],
    offer: ["offer_at"],
};

const OPEN_STATUSES = ["interested", "applied", "responded", "interview", "offer"];
const CLOSED_STATUSES = ["accepted", "rejected"];

// A status at or beyond `applied` is itself evidence the record was applied to,
// independent of whether anyone stamped the date. `rejected` is deliberately
// absent: that it means "was applied to and turned down" is exactly the
// assumption this migration exists to stop making.
const STATUSES_IMPLYING_APPLICATION = [
    "applied",
    "responded",
    "interview",
    "offer",
    "accepted",
];

function hasDate(value) {
    return value !== null && value !== undefined && String(value).trim() !== "";
}

// The furthest stage the row carries a date for, or null when it carries none.
function furthestDatedStage(row) {
    let found = null;
    for (const stage of STAGE_ORDER) {
        if (STAGE_DATE_COLUMNS[stage].some((col) => hasDate(row[col]))) {
            found = stage;
        }
    }
    return found;
}

// True when anything in the record evidences an actual application.
function evidencesApplication(row) {
    if (STATUSES_IMPLYING_APPLICATION.includes(row.status)) return true;
    const furthest = furthestDatedStage(row);
    if (!furthest) return false;
    return STAGE_ORDER.indexOf(furthest) >= STAGE_ORDER.indexOf("applied");
}

function deriveRecordType(row) {
    return evidencesApplication(row) ? "application" : "lead";
}

/**
 * Derive stage, state, close_reason and record_type for one pre-split row.
 *
 * Returns `{ stage, state, close_reason, record_type, rule, review }`. When the
 * status is not one this migration understands, every derived value is null and
 * `review` is true — the row is reported, never guessed at.
 */
function deriveRecord(row) {
    if (OPEN_STATUSES.includes(row.status)) {
        return {
            stage: row.status,
            state: "open",
            close_reason: null,
            record_type: deriveRecordType(row),
            rule: "open_status",
            review: false,
        };
    }

    if (row.status === "accepted") {
        return {
            stage: "offer",
            state: "closed",
            close_reason: "accepted",
            record_type: deriveRecordType(row),
            rule: "accepted",
            review: false,
        };
    }

    if (row.status === "rejected") {
        const furthest = furthestDatedStage(row);
        const reachedApplied =
            furthest &&
            STAGE_ORDER.indexOf(furthest) >= STAGE_ORDER.indexOf("applied");

        if (reachedApplied) {
            return {
                stage: furthest,
                state: "closed",
                close_reason: "rejected",
                record_type: deriveRecordType(row),
                rule: "rejected_with_progress",
                review: false,
            };
        }

        // Closed as rejected with nothing to show it was ever applied to. The
        // real reason is unrecoverable, so it is recorded as unresolved rather
        // than assigned a plausible-looking default.
        return {
            stage: "interested",
            state: "closed",
            close_reason: "unresolved",
            record_type: deriveRecordType(row),
            rule: "rejected_no_progress",
            review: true,
        };
    }

    return {
        stage: null,
        state: null,
        close_reason: null,
        record_type: null,
        rule: "unknown_status",
        review: true,
    };
}

// --- Person-row candidates (advisory only) ---------------------------------

const PHONE_PATTERN = /(?:\+?\d[\d\s().-]{7,}\d)/;

// Each signal on its own describes plenty of legitimate records, so a row needs
// at least two before it is worth an operator's attention. This list never
// feeds a write: conversion is an explicit operator action.
const PERSON_ROW_THRESHOLD = 2;

function personRowReasons(row) {
    const reasons = [];
    if (!row.role_title || String(row.role_title).trim() === "") {
        reasons.push("role_title is empty");
    }
    if (row.prep_work && PHONE_PATTERN.test(String(row.prep_work))) {
        reasons.push("prep_work contains a phone number");
    }
    if (!row.job_posting_url || String(row.job_posting_url).trim() === "") {
        reasons.push("no job_posting_url");
    }
    return reasons;
}

function findPersonCandidates(rows) {
    const candidates = [];
    for (const row of rows) {
        const reasons = personRowReasons(row);
        if (reasons.length >= PERSON_ROW_THRESHOLD) {
            candidates.push({
                id: row.id,
                company_name: row.company_name,
                role_title: row.role_title,
                reasons,
            });
        }
    }
    return candidates;
}

// --- Report ----------------------------------------------------------------

function tally(items, key) {
    const counts = {};
    for (const item of items) {
        const value = key(item) ?? "none";
        counts[value] = (counts[value] || 0) + 1;
    }
    return counts;
}

/**
 * Compute the derivation for every record and return a report. Performs no
 * writes to the database. When `reportPath` is given the report is also written
 * there as JSON.
 */
function buildReport(db, { reportPath } = {}) {
    const rows = db.prepare("SELECT * FROM applications ORDER BY id").all();

    const records = rows.map((row) => {
        const derived = deriveRecord(row);
        return {
            id: row.id,
            company_name: row.company_name,
            role_title: row.role_title,
            status: row.status,
            derived,
            rule: derived.rule,
            review: derived.review,
        };
    });

    const report = {
        generated_at: new Date().toISOString(),
        summary: {
            total: records.length,
            flagged: records.filter((r) => r.review).length,
            by_close_reason: tally(records, (r) => r.derived.close_reason),
            by_record_type: tally(records, (r) => r.derived.record_type),
            by_rule: tally(records, (r) => r.rule),
        },
        records,
        person_row_candidates: findPersonCandidates(rows),
    };

    if (reportPath) {
        fs.mkdirSync(path.dirname(reportPath), { recursive: true });
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
    }

    return report;
}

module.exports = {
    deriveRecord,
    buildReport,
    findPersonCandidates,
    STAGE_ORDER,
    STAGE_DATE_COLUMNS,
    OPEN_STATUSES,
    CLOSED_STATUSES,
};
