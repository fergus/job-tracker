"use strict";
const db = require("../db");
const { clearsNextStepOnClose } = require("./settings");
const fs = require("fs");
const path = require("path");
const { extractText } = require("./extraction");
const { ALLOWED_EXTENSIONS, MIME_MAP } = require("../lib/mime");
const { isValidUrl } = require("../lib/validation");
const { uploadsDir, safePath, safeDeleteFile } = require("../lib/files");
const { emitChange } = require("../lib/events");
const { visibleStageNotesForApplications } = require("./stage-notes");
const {
    VALID_FOLLOWUP_STATES,
    followUpState,
    daysUntil,
    toCalendarDate,
    todayInInstanceZone,
} = require("../lib/followup");

class ServiceError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

// The stages a stage note can be filed under. Wider than VALID_STAGES: a note
// can record an outcome (accepted, rejected), which is a close reason on the
// record rather than a stage it can sit at.
const NOTE_STAGES = [
    "interested",
    "applied",
    "responded",
    "interview",
    "offer",
    "accepted",
    "rejected",
];

// --- Stage, state, close reason and record type ---------------------------
//
// The legacy `status` column has been dropped; a record is described by these
// fields.

const VALID_STAGES = [
    "interested",
    "applied",
    "responded",
    "interview",
    "offer",
];
const VALID_STATES = ["open", "closed"];
const VALID_RECORD_TYPES = ["application", "lead"];
const VALID_CLOSE_REASONS = [
    "accepted",
    "rejected",
    "withdrawn",
    "role_closed",
    "lapsed",
    "not_pursued",
    "unresolved",
];

// The date column a stage stamps when a record reaches it.
const STAGE_DATE_MAP = {
    interested: "interested_at",
    applied: "applied_at",
    responded: "responded_at",
    interview: "interview_at",
    offer: "offer_at",
};

// A record is an application once something evidences it was actually applied
// to: a stage at or beyond `applied`. Closing is NOT such evidence -- a lead
// you close is still a lead, and treating a close as proof of an application
// is the exact conflation the split exists to undo.
function evidencesApplication(stage) {
    if (!stage) return false;
    return VALID_STAGES.indexOf(stage) >= VALID_STAGES.indexOf("applied");
}

const LEGACY_STATUS_MESSAGE =
    "status is no longer supported: use stage, state, close_reason and record_type";

// A `status` argument fails rather than being ignored: silently returning
// everything, or writing nothing, is how a caller keeps trusting a field that
// no longer exists. Shared by the REST routes and the MCP tools.
function rejectLegacyStatus(args) {
    if (
        args &&
        args.status !== undefined &&
        args.status !== null &&
        args.status !== ""
    ) {
        throw new ServiceError(400, LEGACY_STATUS_MESSAGE);
    }
}

// The one outbound shape for a record: the legacy column never leaves the
// server, whichever surface the row is leaving through.
function toApiRecord(row) {
    if (!row) return row;
    const { status: _legacyStatus, ...rest } = row;
    return rest;
}

const LIMITS = {
    company_name: 200,
    role_title: 200,
    job_description: 10000,
    job_posting_url: 2000,
    company_website_url: 2000,
    interview_notes: 10000,
    prep_work: 10000,
    job_location: 500,
};

function validateInputLengths(body, fields) {
    for (const field of fields) {
        if (body[field] && body[field].length > LIMITS[field]) {
            return `${field} exceeds maximum length of ${LIMITS[field]} characters`;
        }
    }
    return null;
}

function getOwnApp(id, userEmail) {
    return db
        .prepare("SELECT * FROM applications WHERE id = ? AND user_email = ?")
        .get(id, userEmail);
}

// Decorate a record with its derived follow-up state, so the API, MCP and the
// board all read one classification instead of each recomputing it. `now` is
// injectable for tests; callers mapping over rows must not pass the index.
function withFollowUp(row, now = new Date()) {
    return {
        ...toApiRecord(row),
        follow_up_state: followUpState(row.next_action_at, now),
        follow_up_days: daysUntil(row.next_action_at, now),
    };
}

const FOLLOW_UP_DATE_ERROR =
    "next_action_at must be a calendar date (YYYY-MM-DD)";

// Normalise a follow-up date write to YYYY-MM-DD, or null to clear. '' clears
// too: multipart forms send empty fields as ''. toCalendarDate only checks the
// shape, so 2026-13-40 would pass it; the round trip through Date.UTC rejects
// dates that do not exist without changing the helper contacts share.
function normaliseFollowUpDate(value) {
    if (value === null || value === "") return null;
    const date = typeof value === "string" ? toCalendarDate(value) : null;
    if (!date) throw new ServiceError(400, FOLLOW_UP_DATE_ERROR);
    const [y, m, d] = date.split("-").map(Number);
    const check = new Date(Date.UTC(y, m - 1, d));
    if (
        check.getUTCFullYear() !== y ||
        check.getUTCMonth() !== m - 1 ||
        check.getUTCDate() !== d
    ) {
        throw new ServiceError(400, FOLLOW_UP_DATE_ERROR);
    }
    return date;
}

const NEXT_ACTION_MAX = 500;

// Normalise a next-step wording write: null or '' clears, anything else must be
// a string within the limit. Kept apart from LIMITS because a non-string has to
// be refused outright, and validateInputLengths only measures strings.
function normaliseNextAction(value) {
    if (value === null || value === "") return null;
    if (typeof value !== "string") {
        throw new ServiceError(400, "next_action must be a string or null");
    }
    if (value.length > NEXT_ACTION_MAX) {
        throw new ServiceError(
            400,
            `next_action exceeds maximum length of ${NEXT_ACTION_MAX} characters`,
        );
    }
    return value;
}

function attachNotes(rows) {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return rows;
    const notes = visibleStageNotesForApplications(ids);
    const notesByApp = {};
    for (const n of notes) {
        (notesByApp[n.application_id] ||= []).push(n);
    }
    return rows.map((r) => ({ ...r, notes: notesByApp[r.id] || [] }));
}

// --- Service functions ---

function listApplications(
    userEmail,
    {
        state,
        close_reason,
        record_type,
        all,
        updated_since,
        company_name,
        follow_up_state,
        limit,
        offset,
        includeNotes = true,
        isAdmin = false,
        now = new Date(),
    } = {},
) {
    const showAll = isAdmin && all === "true";
    const conditions = [];
    const params = [];

    if (!showAll) {
        conditions.push("a.user_email = ?");
        params.push(userEmail);
    }

    // The split filters. An unknown value is rejected rather than ignored:
    // silently returning everything is how a caller ends up trusting a count
    // that answers a different question than the one it asked.
    if (state !== undefined && state !== null && state !== "") {
        if (!VALID_STATES.includes(state)) {
            throw new ServiceError(
                400,
                `Invalid state: expected one of ${VALID_STATES.join(", ")}`,
            );
        }
        conditions.push("a.state = ?");
        params.push(state);
    }

    if (close_reason !== undefined && close_reason !== null && close_reason !== "") {
        if (!VALID_CLOSE_REASONS.includes(close_reason)) {
            throw new ServiceError(
                400,
                `Invalid close_reason: expected one of ${VALID_CLOSE_REASONS.join(", ")}`,
            );
        }
        conditions.push("a.close_reason = ?");
        params.push(close_reason);
    }

    if (record_type !== undefined && record_type !== null && record_type !== "") {
        if (!VALID_RECORD_TYPES.includes(record_type)) {
            throw new ServiceError(
                400,
                `Invalid record_type: expected one of ${VALID_RECORD_TYPES.join(", ")}`,
            );
        }
        conditions.push("a.record_type = ?");
        params.push(record_type);
    }

    if (updated_since) {
        if (isNaN(Date.parse(updated_since))) {
            throw new ServiceError(
                400,
                "Invalid updated_since: expected ISO 8601 date string",
            );
        }
        conditions.push("a.updated_at > ?");
        params.push(updated_since);
    }

    if (company_name) {
        conditions.push("a.company_name LIKE ?");
        params.push(`%${company_name}%`);
    }

    const followUpStates = parseFollowUpStates(follow_up_state);
    if (followUpStates.length > 0) {
        // Compared in SQL rather than filtered after the fetch so the paginated
        // total counts matching rows, not the page. Today is computed once from
        // the same `now` the decorator uses, so a request straddling midnight
        // cannot return a row under `due` that it then labels `overdue`.
        //
        // The column is compared bare rather than through date(): every stored
        // value is already a validated YYYY-MM-DD, which sorts identically as
        // text, and wrapping the column stops SQLite seeking
        // idx_applications_next_action -- the index this filter exists to use.
        const today = todayInInstanceZone(now);
        const ops = { overdue: "<", due: "=", upcoming: ">" };
        conditions.push(
            `a.next_action_at IS NOT NULL AND (${followUpStates
                .map((s) => `a.next_action_at ${ops[s]} ?`)
                .join(" OR ")})`,
        );
        for (let i = 0; i < followUpStates.length; i++) params.push(today);
    }

    const where =
        conditions.length > 0 ? " WHERE " + conditions.join(" AND ") : "";

    const usePagination = limit !== undefined || offset !== undefined;

    if (usePagination) {
        const total = db
            .prepare(
                `SELECT COUNT(*) as cnt FROM applications a${where}`,
            )
            .get(...params).cnt;

        const resolvedLimit = Math.min(limit ?? 50, 200);
        const resolvedOffset = offset ?? 0;

        const rows = db
            .prepare(
                `SELECT a.*, (SELECT COUNT(*) FROM attachments WHERE application_id = a.id) as attachment_count FROM applications a${where} ORDER BY a.updated_at DESC LIMIT ? OFFSET ?`,
            )
            .all(...params, resolvedLimit, resolvedOffset);

        const items = (includeNotes ? attachNotes(rows) : rows).map((r) =>
            withFollowUp(r, now),
        );
        return { total, items };
    }

    const rows = db
        .prepare(
            `SELECT a.*, (SELECT COUNT(*) FROM attachments WHERE application_id = a.id) as attachment_count FROM applications a${where} ORDER BY a.updated_at DESC`,
        )
        .all(...params);

    return (includeNotes ? attachNotes(rows) : rows).map((r) => withFollowUp(r, now));
}

const FOLLOW_UP_STATE_ERROR = `Invalid follow_up_state: expected one or more of ${VALID_FOLLOWUP_STATES.join(", ")}`;

// Accepts an array or a comma-separated string, so REST and MCP callers share
// one parse. Empty means no filter; an unknown member is rejected for the same
// reason as the split filters above.
function parseFollowUpStates(value) {
    if (value === undefined || value === null) return [];
    const raw = Array.isArray(value) ? value : [value];
    const members = [];
    for (const item of raw) {
        if (typeof item !== "string") {
            throw new ServiceError(400, FOLLOW_UP_STATE_ERROR);
        }
        for (const part of item.split(",")) {
            const s = part.trim();
            if (!s) continue;
            if (!VALID_FOLLOWUP_STATES.includes(s)) {
                throw new ServiceError(400, FOLLOW_UP_STATE_ERROR);
            }
            if (!members.includes(s)) members.push(s);
        }
    }
    return members;
}

function getApplication(userEmail, id, { isAdmin = false } = {}) {
    const row = isAdmin
        ? db.prepare("SELECT * FROM applications WHERE id = ?").get(id)
        : getOwnApp(id, userEmail);
    if (!row) throw new ServiceError(404, "Not found");
    const withNotes = attachNotes([row])[0];
    // Required lazily: contacts requires db, and requiring it at module scope
    // would create a cycle through the shared db module during startup.
    const { contactsForApplication } = require("./contacts");
    return withFollowUp({
        ...withNotes,
        contacts: contactsForApplication(row.id),
    });
}

function createApplication(userEmail, data) {
    const {
        company_name,
        role_title,
        stage: rawStage,
        record_type: rawRecordType,
        job_description,
        job_posting_url,
        company_website_url,
        interview_notes,
        prep_work,
        job_location,
        salary_min: rawSalaryMin,
        salary_max: rawSalaryMax,
        cv_filename = null,
        cv_path = null,
        cover_letter_filename = null,
        cover_letter_path = null,
    } = data;

    if (!company_name || !role_title) {
        throw new ServiceError(400, "company_name and role_title are required");
    }

    const lengthError = validateInputLengths(data, Object.keys(LIMITS));
    if (lengthError) throw new ServiceError(400, lengthError);

    // Multipart forms send empty fields as ''; treat '' as not given.
    const stage = rawStage === undefined || rawStage === "" ? "interested" : rawStage;
    if (!VALID_STAGES.includes(stage)) {
        throw new ServiceError(
            400,
            `stage must be one of: ${VALID_STAGES.join(", ")}`,
        );
    }
    const givenRecordType =
        rawRecordType === undefined || rawRecordType === ""
            ? null
            : rawRecordType;
    if (givenRecordType !== null && !VALID_RECORD_TYPES.includes(givenRecordType)) {
        throw new ServiceError(
            400,
            `record_type must be one of: ${VALID_RECORD_TYPES.join(", ")}`,
        );
    }

    if (!isValidUrl(job_posting_url))
        throw new ServiceError(
            400,
            "job_posting_url must be an http or https URL",
        );
    if (!isValidUrl(company_website_url))
        throw new ServiceError(
            400,
            "company_website_url must be an http or https URL",
        );

    // Multipart forms send empty fields as ''; treat '' as null
    let salary_min =
        rawSalaryMin != null && rawSalaryMin !== ""
            ? Number(rawSalaryMin)
            : null;
    let salary_max =
        rawSalaryMax != null && rawSalaryMax !== ""
            ? Number(rawSalaryMax)
            : null;
    if (
        salary_min !== null &&
        (!Number.isInteger(salary_min) || salary_min < 0)
    ) {
        throw new ServiceError(
            400,
            "salary_min must be a non-negative integer or null",
        );
    }
    if (
        salary_max !== null &&
        (!Number.isInteger(salary_max) || salary_max < 0)
    ) {
        throw new ServiceError(
            400,
            "salary_max must be a non-negative integer or null",
        );
    }
    if (salary_min !== null && salary_max !== null && salary_min > salary_max) {
        throw new ServiceError(400, "salary_min must not exceed salary_max");
    }

    let nextActionAt =
        data.next_action_at === undefined
            ? null
            : normaliseFollowUpDate(data.next_action_at);
    let nextAction =
        data.next_action === undefined
            ? null
            : normaliseNextAction(data.next_action);

    const now = new Date().toISOString();
    const dateField = STAGE_DATE_MAP[stage];
    // A stage at or beyond `applied` makes the record an application whatever
    // record_type says; below it the given type holds, defaulting to a lead.
    const recordType = evidencesApplication(stage)
        ? "application"
        : (givenRecordType ?? "lead");

    const result = db
        .prepare(
            `
    INSERT INTO applications (company_name, role_title, job_description, job_posting_url, company_website_url,
      cv_filename, cv_path, cover_letter_filename, cover_letter_path, interview_notes, prep_work,
      salary_min, salary_max, job_location,
      created_at, updated_at,
      interested_at, applied_at, responded_at, interview_at, offer_at, closed_at, user_email,
      stage, state, close_reason, record_type, next_action_at, next_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
        )
        .run(
            company_name,
            role_title,
            job_description || null,
            job_posting_url || null,
            company_website_url || null,
            cv_filename,
            cv_path,
            cover_letter_filename,
            cover_letter_path,
            interview_notes || null,
            prep_work || null,
            salary_min,
            salary_max,
            job_location || null,
            now,
            now,
            now,
            dateField === "applied_at" ? now : null,
            dateField === "responded_at" ? now : null,
            dateField === "interview_at" ? now : null,
            dateField === "offer_at" ? now : null,
            null,
            userEmail,
            stage,
            "open",
            null,
            recordType,
            nextActionAt,
            nextAction,
        );

    const created = db
        .prepare("SELECT * FROM applications WHERE id = ?")
        .get(result.lastInsertRowid);
    emitChange(userEmail, "created", created.id);
    return withFollowUp(created);
}

function updateApplication(userEmail, id, data) {
    const existing = getOwnApp(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const fields = [
        "company_name",
        "role_title",
        "job_description",
        "job_posting_url",
        "company_website_url",
        "interview_notes",
        "prep_work",
        "job_location",
    ];
    const updates = [];
    const values = [];

    const lengthError = validateInputLengths(data, fields);
    if (lengthError) throw new ServiceError(400, lengthError);

    if (
        data.job_posting_url !== undefined &&
        !isValidUrl(data.job_posting_url)
    ) {
        throw new ServiceError(
            400,
            "job_posting_url must be an http or https URL",
        );
    }
    if (
        data.company_website_url !== undefined &&
        !isValidUrl(data.company_website_url)
    ) {
        throw new ServiceError(
            400,
            "company_website_url must be an http or https URL",
        );
    }

    if (data.salary_min !== undefined) {
        const val = data.salary_min;
        if (val !== null && (!Number.isInteger(val) || val < 0)) {
            throw new ServiceError(
                400,
                "salary_min must be a non-negative integer or null",
            );
        }
    }
    if (data.salary_max !== undefined) {
        const val = data.salary_max;
        if (val !== null && (!Number.isInteger(val) || val < 0)) {
            throw new ServiceError(
                400,
                "salary_max must be a non-negative integer or null",
            );
        }
    }
    const salaryMin =
        data.salary_min !== undefined ? data.salary_min : existing.salary_min;
    const salaryMax =
        data.salary_max !== undefined ? data.salary_max : existing.salary_max;
    if (salaryMin != null && salaryMax != null && salaryMin > salaryMax) {
        throw new ServiceError(400, "salary_min must not exceed salary_max");
    }

    // Validated even on a close, which then discards them: a malformed value is
    // still an error the caller should hear about.
    let nextActionAt =
        data.next_action_at === undefined
            ? undefined
            : normaliseFollowUpDate(data.next_action_at);
    let nextAction =
        data.next_action === undefined
            ? undefined
            : normaliseNextAction(data.next_action);

    for (const field of fields) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(data[field]);
        }
    }

    for (const field of ["salary_min", "salary_max"]) {
        if (data[field] !== undefined) {
            updates.push(`${field} = ?`);
            values.push(data[field]);
        }
    }

    // The split fields.
    if (data.stage !== undefined && !VALID_STAGES.includes(data.stage)) {
        throw new ServiceError(
            400,
            `stage must be one of: ${VALID_STAGES.join(", ")}`,
        );
    }
    if (data.state !== undefined && !VALID_STATES.includes(data.state)) {
        throw new ServiceError(
            400,
            `state must be one of: ${VALID_STATES.join(", ")}`,
        );
    }
    if (
        data.close_reason !== undefined &&
        data.close_reason !== null &&
        !VALID_CLOSE_REASONS.includes(data.close_reason)
    ) {
        throw new ServiceError(
            400,
            `close_reason must be one of: ${VALID_CLOSE_REASONS.join(", ")}`,
        );
    }
    if (
        data.record_type !== undefined &&
        !VALID_RECORD_TYPES.includes(data.record_type)
    ) {
        throw new ServiceError(
            400,
            `record_type must be one of: ${VALID_RECORD_TYPES.join(", ")}`,
        );
    }

    const touchesSplit =
        data.stage !== undefined ||
        data.state !== undefined ||
        data.close_reason !== undefined;
    let closesRecord = false;

    if (touchesSplit) {
        const nextStage = data.stage !== undefined ? data.stage : existing.stage;
        const nextState = data.state !== undefined ? data.state : existing.state;

        let nextCloseReason;
        if (data.state === "open") {
            // An explicit reopen discards the close reason rather than leaving
            // a stale one attached to a record that is running again. Note this
            // keys on the write, not on the resulting state: setting a close
            // reason on an already-open record is an error, not a no-op.
            nextCloseReason = null;
        } else if (data.close_reason !== undefined) {
            nextCloseReason = data.close_reason;
        } else {
            nextCloseReason = existing.close_reason;
        }

        if (nextState !== "closed" && nextCloseReason) {
            throw new ServiceError(
                400,
                "close_reason may only be set on a closed record",
            );
        }
        if (nextState === "closed" && !nextCloseReason) {
            throw new ServiceError(
                400,
                "close_reason is required when closing a record",
            );
        }

        closesRecord = nextState === "closed";
        updates.push("stage = ?", "state = ?", "close_reason = ?");
        values.push(nextStage, nextState, nextCloseReason);

        if (nextState === "closed" && !existing.closed_at) {
            updates.push("closed_at = ?");
            values.push(new Date().toISOString());
        } else if (data.state === "open") {
            // Clear it on reopen, so a later re-close records when the record
            // actually ended rather than when it first did.
            updates.push("closed_at = ?");
            values.push(null);
        }

        // Reaching a stage stamps its date, which the timeline reads. Only a
        // change of stage counts, plus a reopen onto a stage that has no date
        // yet: re-saving the stage a record is at, or reopening it where it
        // closed (an Undo of a close), must not overwrite the date it first
        // got there.
        const reopens = existing.state === "closed" && nextState === "open";
        const dateField = STAGE_DATE_MAP[nextStage];
        if (
            dateField &&
            (nextStage !== existing.stage || (reopens && !existing[dateField]))
        ) {
            updates.push(`${dateField} = ?`);
            values.push(new Date().toISOString());
        }

        // A stage that genuinely moves past `applied` in this write is
        // evidence the record became an application. An explicitly stored
        // `lead` is otherwise the operator's statement and no unrelated write
        // overturns it: reopening a record parked at `responded` must not flip
        // it back.
        if (
            data.record_type === undefined &&
            existing.record_type === "lead" &&
            data.stage !== undefined &&
            evidencesApplication(nextStage) &&
            !evidencesApplication(existing.stage)
        ) {
            updates.push("record_type = ?");
            values.push("application");
        }
    }

    if (data.record_type !== undefined) {
        updates.push("record_type = ?");
        values.push(data.record_type);
    }

    // Closing ends the commitment by default: a closed record owes nothing, so
    // both halves of its next step go, whatever this write also sent for them.
    // A user can turn this off in settings, and the step then stays on the
    // closed record (Today still hides it) and comes back on reopen. Forced here
    // rather than pushed as a second assignment, so each column is set once.
    // When it is cleared, reopening restores nothing: the step was discarded.
    if (closesRecord && clearsNextStepOnClose(userEmail)) {
        nextActionAt = null;
        nextAction = null;
    }

    // Pushed after every other field so a write carrying only the follow-up
    // (date, wording, or both) is recognisable by the update count alone.
    const otherUpdates = updates.length;
    if (nextActionAt !== undefined) {
        updates.push("next_action_at = ?");
        values.push(nextActionAt);
    }
    if (nextAction !== undefined) {
        updates.push("next_action = ?");
        values.push(nextAction);
    }
    const followUpOnly = otherUpdates === 0 && updates.length > 0;

    if (updates.length === 0)
        throw new ServiceError(400, "No fields to update");

    // A follow-up-only write leaves updated_at alone: updated_at drives card
    // staleness, and scheduling, rewording or clearing a follow-up is not
    // activity on the record. It still emits, so open boards pick the date up.
    if (!followUpOnly) {
        updates.push("updated_at = ?");
        values.push(new Date().toISOString());
    }
    values.push(id);
    values.push(userEmail);

    db.prepare(
        `UPDATE applications SET ${updates.join(", ")} WHERE id = ? AND user_email = ?`,
    ).run(...values);
    emitChange(userEmail, "updated", Number(id));
    return withFollowUp(
        db.prepare("SELECT * FROM applications WHERE id = ?").get(id),
    );
}

function deleteApplication(userEmail, id) {
    const existing = getOwnApp(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const attachments = db
        .prepare(
            "SELECT stored_filename FROM attachments WHERE application_id = ?",
        )
        .all(id);
    const filesToDelete = attachments.map((a) => a.stored_filename);
    if (existing.cv_path) filesToDelete.push(existing.cv_path);
    if (existing.cover_letter_path)
        filesToDelete.push(existing.cover_letter_path);

    db.prepare("DELETE FROM applications WHERE id = ? AND user_email = ?").run(
        id,
        userEmail,
    );

    for (const filename of filesToDelete) {
        const filePath = safePath(uploadsDir, filename);
        if (filePath) safeDeleteFile(filePath);
    }

    emitChange(userEmail, "deleted", Number(id));
    return { success: true };
}

async function uploadAttachments(userEmail, appId, files) {
    const existing = getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");
    if (!files || files.length === 0)
        throw new ServiceError(400, "No files uploaded");

    const now = new Date().toISOString();
    const items = [];

    for (const file of files) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new ServiceError(400, `File type not allowed: ${ext}`);
        }
        const mime = MIME_MAP[ext] || null;
        const storedFilename =
            Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;
        const destPath = path.join(uploadsDir, storedFilename);
        fs.writeFileSync(destPath, file.buffer);
        const extracted = await extractText(destPath, mime);
        items.push({
            appId,
            originalFilename: file.originalname,
            storedFilename,
            fileSize: file.buffer.length,
            mime,
            now,
            extracted,
        });
    }

    const insertAttachments = db.transaction(() => {
        const inserted = [];
        for (const item of items) {
            const result = db
                .prepare(
                    "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type, created_at, extracted_text, extracted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .run(
                    item.appId,
                    item.originalFilename,
                    item.storedFilename,
                    item.fileSize,
                    item.mime,
                    item.now,
                    item.extracted,
                    item.extracted ? item.now : null,
                );
            inserted.push({
                id: result.lastInsertRowid,
                original_filename: item.originalFilename,
                stored_filename: item.storedFilename,
                file_size: item.fileSize,
                mime_type: item.mime,
                created_at: item.now,
                extracted_text: item.extracted,
                extracted_at: item.extracted ? item.now : null,
            });
        }
        db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
            now,
            appId,
        );
        return inserted;
    });

    const inserted = insertAttachments();
    emitChange(userEmail, "updated", Number(appId));
    return inserted;
}

function listAttachments(userEmail, appId, { isAdmin = false } = {}) {
    const existing = isAdmin
        ? db.prepare("SELECT * FROM applications WHERE id = ?").get(appId)
        : getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    return db
        .prepare(
            "SELECT id, original_filename, file_size, mime_type, created_at, extracted_text, extracted_at, generated_by, generation_task FROM attachments WHERE application_id = ? ORDER BY created_at ASC",
        )
        .all(appId);
}

function getAttachment(
    userEmail,
    appId,
    attachmentId,
    { isAdmin = false } = {},
) {
    const existing = isAdmin
        ? db.prepare("SELECT * FROM applications WHERE id = ?").get(appId)
        : getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const attachment = db
        .prepare(
            "SELECT * FROM attachments WHERE id = ? AND application_id = ?",
        )
        .get(attachmentId, appId);
    if (!attachment) throw new ServiceError(404, "Attachment not found");

    return attachment;
}

module.exports = {
    ServiceError,
    NOTE_STAGES,
    VALID_STAGES,
    VALID_STATES,
    VALID_RECORD_TYPES,
    VALID_CLOSE_REASONS,
    STAGE_DATE_MAP,
    LEGACY_STATUS_MESSAGE,
    rejectLegacyStatus,
    toApiRecord,
    getOwnApp,
    attachNotes,
    withFollowUp,
    normaliseFollowUpDate,
    normaliseNextAction,
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    deleteApplication,
    listAttachments,
    getAttachment,
    uploadAttachments,
};
