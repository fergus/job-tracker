"use strict";

// The one place that answers "which stage notes are visible for this
// application". Deleting a note hides it rather than destroying the row, so
// every read has to skip hidden rows -- and there are seven of them, across
// the applications list, two REST routes, two MCP context builders and the
// application-to-contact conversion. Seven copies of the same WHERE clause is
// seven chances to forget one, so they all come through here instead.

const db = require("../db");

const VISIBLE = "hidden_at IS NULL";

// A single application's notes, oldest first.
function visibleStageNotes(applicationId) {
    return db
        .prepare(
            `SELECT * FROM stage_notes WHERE application_id = ? AND ${VISIBLE} ORDER BY created_at ASC`,
        )
        .all(applicationId);
}

// The many-application shape the applications list needs. Returns a flat list
// in the same order a single-application read would give within each app.
function visibleStageNotesForApplications(applicationIds) {
    if (applicationIds.length === 0) return [];
    const placeholders = applicationIds.map(() => "?").join(",");
    return db
        .prepare(
            `SELECT * FROM stage_notes WHERE application_id IN (${placeholders}) AND ${VISIBLE} ORDER BY created_at ASC`,
        )
        .all(...applicationIds);
}

module.exports = { visibleStageNotes, visibleStageNotesForApplications };
