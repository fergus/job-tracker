"use strict";
const db = require("../db");
const fs = require("fs");
const path = require("path");
const { extractText } = require("./extraction");
const { ALLOWED_EXTENSIONS, MIME_MAP } = require("../lib/mime");
const { isValidUrl } = require("../lib/validation");
const { uploadsDir, safePath, safeDeleteFile } = require("../lib/files");

class ServiceError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

const VALID_STATUSES = [
    "interested",
    "applied",
    "responded",
    "interview",
    "offer",
    "accepted",
    "rejected",
];

const STATUS_DATE_MAP = {
    interested: "interested_at",
    applied: "applied_at",
    responded: "responded_at",
    interview: "interview_at",
    offer: "offer_at",
    accepted: "closed_at",
    rejected: "closed_at",
};

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

function attachNotes(rows) {
    const ids = rows.map((r) => r.id);
    if (ids.length === 0) return rows;
    const placeholders = ids.map(() => "?").join(",");
    const notes = db
        .prepare(
            `SELECT * FROM stage_notes WHERE application_id IN (${placeholders}) ORDER BY created_at ASC`,
        )
        .all(...ids);
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
        status,
        all,
        updated_since,
        company_name,
        limit,
        offset,
        includeNotes = true,
        isAdmin = false,
    } = {},
) {
    const showAll = isAdmin && all === "true";
    const conditions = [];
    const params = [];

    if (!showAll) {
        conditions.push("a.user_email = ?");
        params.push(userEmail);
    }

    if (status && VALID_STATUSES.includes(status)) {
        conditions.push("a.status = ?");
        params.push(status);
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

        const items = includeNotes ? attachNotes(rows) : rows;
        return { total, items };
    }

    const rows = db
        .prepare(
            `SELECT a.*, (SELECT COUNT(*) FROM attachments WHERE application_id = a.id) as attachment_count FROM applications a${where} ORDER BY a.updated_at DESC`,
        )
        .all(...params);

    return includeNotes ? attachNotes(rows) : rows;
}

function getApplication(userEmail, id, { isAdmin = false } = {}) {
    const row = isAdmin
        ? db.prepare("SELECT * FROM applications WHERE id = ?").get(id)
        : getOwnApp(id, userEmail);
    if (!row) throw new ServiceError(404, "Not found");
    return attachNotes([row])[0];
}

function createApplication(userEmail, data) {
    const {
        company_name,
        role_title,
        status,
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

    const now = new Date().toISOString();
    const appStatus =
        status && VALID_STATUSES.includes(status) ? status : "interested";
    const dateField = STATUS_DATE_MAP[appStatus];

    const result = db
        .prepare(
            `
    INSERT INTO applications (company_name, role_title, status, job_description, job_posting_url, company_website_url,
      cv_filename, cv_path, cover_letter_filename, cover_letter_path, interview_notes, prep_work,
      salary_min, salary_max, job_location,
      created_at, updated_at,
      interested_at, applied_at, responded_at, interview_at, offer_at, closed_at, user_email)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
        )
        .run(
            company_name,
            role_title,
            appStatus,
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
            dateField === "closed_at" ? now : null,
            userEmail,
        );

    return db
        .prepare("SELECT * FROM applications WHERE id = ?")
        .get(result.lastInsertRowid);
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

    if (updates.length === 0)
        throw new ServiceError(400, "No fields to update");

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);
    values.push(userEmail);

    db.prepare(
        `UPDATE applications SET ${updates.join(", ")} WHERE id = ? AND user_email = ?`,
    ).run(...values);
    return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
}

function updateStatus(userEmail, id, status) {
    if (!status || !VALID_STATUSES.includes(status)) {
        throw new ServiceError(400, "Invalid status");
    }

    const existing = getOwnApp(id, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const now = new Date().toISOString();
    const updates = ["status = ?", "updated_at = ?"];
    const values = [status, now];

    const dateField = STATUS_DATE_MAP[status];
    if (dateField) {
        updates.push(`${dateField} = ?`);
        values.push(now);
    }

    values.push(id);
    values.push(userEmail);
    db.prepare(
        `UPDATE applications SET ${updates.join(", ")} WHERE id = ? AND user_email = ?`,
    ).run(...values);
    return db.prepare("SELECT * FROM applications WHERE id = ?").get(id);
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

    return { success: true };
}

function addNote(userEmail, appId, { stage, content }) {
    const existing = getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    if (!stage || !content)
        throw new ServiceError(400, "stage and content are required");
    if (!VALID_STATUSES.includes(stage))
        throw new ServiceError(400, "Invalid stage");
    if (content.length > 10000)
        throw new ServiceError(
            400,
            "content exceeds maximum length of 10000 characters",
        );

    const now = new Date().toISOString();
    const insertNote = db.transaction(() => {
        const result = db
            .prepare(
                "INSERT INTO stage_notes (application_id, stage, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
            )
            .run(appId, stage, content, now, now);
        db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
            now,
            appId,
        );
        return result;
    });

    const result = insertNote();
    return db
        .prepare("SELECT * FROM stage_notes WHERE id = ?")
        .get(result.lastInsertRowid);
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

    return insertAttachments();
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
    VALID_STATUSES,
    getOwnApp,
    attachNotes,
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    updateStatus,
    deleteApplication,
    addNote,
    listAttachments,
    getAttachment,
    uploadAttachments,
};
