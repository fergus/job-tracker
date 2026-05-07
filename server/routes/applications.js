const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const svc = require("../services/applications");
const { ServiceError, VALID_STATUSES, getOwnApp, attachNotes } = svc;
const { uploadsDir, safePath, safeDeleteFile } = require("../lib/files");
const { ALLOWED_EXTENSIONS, MIME_MAP } = require("../lib/mime");
const { extractStructuredJD } = require("../services/extraction");
const { fetchJobDescription, FetchError } = require("../services/fetch-jd");
const { generateDocument, VALID_TASKS } = require("../services/generation");
const { logAuditEvent } = require("../services/audit");

const router = express.Router();

fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, unique + path.extname(file.originalname));
    },
});

function fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.includes(ext)) {
        cb(null, true);
    } else {
        cb(
            new Error(
                "Only .pdf, .doc, .docx, .md, and .txt files are allowed",
            ),
        );
    }
}

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter,
});

// Converts a ServiceError to an HTTP response; re-throws unexpected errors.
function handleError(res, err) {
    if (err instanceof ServiceError)
        return res.status(err.status).json({ error: err.message });
    throw err;
}

// List applications (scoped to user, or all if admin with ?all=true)
router.get("/", (req, res) => {
    try {
        if (req.isAdmin && req.query.all === "true") {
            console.info("[admin] %s listed all applications", req.userEmail);
        }
        res.json(
            svc.listApplications(req.userEmail, {
                status: req.query.status,
                all: req.query.all,
                updated_since: req.query.updated_since,
                isAdmin: req.isAdmin,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

// Get single application (own or admin view)
router.get("/:id", (req, res) => {
    try {
        res.json(
            svc.getApplication(req.userEmail, req.params.id, {
                isAdmin: req.isAdmin,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

// Get audit log for an application (own or admin view)
router.get("/:id/audit-log", (req, res) => {
    try {
        const existing = req.isAdmin
            ? db
                  .prepare("SELECT * FROM applications WHERE id = ?")
                  .get(req.params.id)
            : getOwnApp(req.params.id, req.userEmail);
        if (!existing) return res.status(404).json({ error: "Not found" });

        if (req.isAdmin && existing.user_email !== req.userEmail) {
            console.info(
                "[admin] %s accessed audit log for app %s owned by %s",
                req.userEmail,
                req.params.id,
                existing.user_email,
            );
        }

        const rows = db.listAuditLogByApp.all(req.params.id);
        const parsed = rows.map((row) => ({
            ...row,
            details: row.details ? JSON.parse(row.details) : null,
        }));
        res.json(parsed);
    } catch (e) {
        handleError(res, e);
    }
});

// Get assembled context for an application (own or admin view)
router.get("/:id/context", (req, res) => {
    try {
        const existing = req.isAdmin
            ? db
                  .prepare("SELECT * FROM applications WHERE id = ?")
                  .get(req.params.id)
            : getOwnApp(req.params.id, req.userEmail);
        if (!existing) return res.status(404).json({ error: "Not found" });

        if (req.isAdmin && existing.user_email !== req.userEmail) {
            console.info(
                "[admin] %s accessed context for app %s owned by %s",
                req.userEmail,
                req.params.id,
                existing.user_email,
            );
        }

        const notes = db
            .prepare(
                "SELECT * FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC",
            )
            .all(req.params.id);
        const attachments = db
            .prepare(
                "SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?",
            )
            .all(req.params.id);
        const profile = db
            .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
            .get(existing.user_email);

        res.json({
            application: existing,
            notes,
            attachments,
            profile: profile || null,
            job_description: existing.job_description || null,
        });
    } catch (e) {
        handleError(res, e);
    }
});

// Create application (multipart for CV + cover letter)
router.post(
    "/",
    upload.fields([
        { name: "cv", maxCount: 1 },
        { name: "cover_letter", maxCount: 1 },
    ]),
    (req, res) => {
        try {
            const data = { ...req.body };
            if (req.files?.cv?.[0]) {
                data.cv_filename = req.files.cv[0].originalname;
                data.cv_path = req.files.cv[0].filename;
            }
            if (req.files?.cover_letter?.[0]) {
                data.cover_letter_filename =
                    req.files.cover_letter[0].originalname;
                data.cover_letter_path = req.files.cover_letter[0].filename;
            }
            const result = svc.createApplication(req.userEmail, data);
            logAuditEvent({
                userEmail: req.userEmail,
                action: "create_application",
                applicationId: result.id,
                source: "rest",
                authMethod: req.authMethod,
                details: {
                    company_name: result.company_name,
                    role_title: result.role_title,
                },
            });
            res.status(201).json(result);
        } catch (e) {
            handleError(res, e);
        }
    },
);

// Update application fields (owner only)
router.put("/:id", (req, res) => {
    try {
        const result = svc.updateApplication(
            req.userEmail,
            req.params.id,
            req.body,
        );
        logAuditEvent({
            userEmail: req.userEmail,
            action: "update_application",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: { fields: Object.keys(req.body) },
        });
        res.json(result);
    } catch (e) {
        handleError(res, e);
    }
});

// Change status (owner only)
router.patch("/:id/status", (req, res) => {
    try {
        const result = svc.updateStatus(
            req.userEmail,
            req.params.id,
            req.body.status,
        );
        logAuditEvent({
            userEmail: req.userEmail,
            action: "update_status",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: { status: req.body.status },
        });
        res.json(result);
    } catch (e) {
        handleError(res, e);
    }
});

// Upload/replace CV (owner only)
router.post("/:id/cv", upload.single("cv"), (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const oldPath = existing.cv_path
        ? safePath(uploadsDir, existing.cv_path)
        : null;

    db.prepare(
        "UPDATE applications SET cv_filename = ?, cv_path = ?, updated_at = ? WHERE id = ? AND user_email = ?",
    ).run(
        req.file.originalname,
        req.file.filename,
        new Date().toISOString(),
        req.params.id,
        req.userEmail,
    );

    if (oldPath) safeDeleteFile(oldPath);

    logAuditEvent({
        userEmail: req.userEmail,
        action: "upload_cv",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: { filename: req.file.originalname },
    });

    res.json(
        db
            .prepare("SELECT * FROM applications WHERE id = ?")
            .get(req.params.id),
    );
});

// Download CV (own or admin view)
router.get("/:id/cv", (req, res) => {
    const existing = req.isAdmin
        ? db
              .prepare("SELECT * FROM applications WHERE id = ?")
              .get(req.params.id)
        : getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!existing.cv_path)
        return res.status(404).json({ error: "No CV uploaded" });

    const filePath = safePath(uploadsDir, existing.cv_path);
    if (!filePath) return res.status(400).json({ error: "Invalid file path" });
    if (!fs.existsSync(filePath))
        return res.status(404).json({ error: "File not found" });

    if (req.isAdmin && existing.user_email !== req.userEmail) {
        console.info(
            "[admin] %s downloaded CV for app %s owned by %s",
            req.userEmail,
            req.params.id,
            existing.user_email,
        );
    }
    const cvMime =
        MIME_MAP[path.extname(existing.cv_filename).toLowerCase()] ||
        "application/octet-stream";
    res.setHeader("Content-Type", cvMime);
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

// Upload/replace cover letter (owner only)
router.post("/:id/cover-letter", upload.single("cover_letter"), (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const oldPath = existing.cover_letter_path
        ? safePath(uploadsDir, existing.cover_letter_path)
        : null;

    db.prepare(
        "UPDATE applications SET cover_letter_filename = ?, cover_letter_path = ?, updated_at = ? WHERE id = ? AND user_email = ?",
    ).run(
        req.file.originalname,
        req.file.filename,
        new Date().toISOString(),
        req.params.id,
        req.userEmail,
    );

    if (oldPath) safeDeleteFile(oldPath);

    logAuditEvent({
        userEmail: req.userEmail,
        action: "upload_cover_letter",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: { filename: req.file.originalname },
    });

    res.json(
        db
            .prepare("SELECT * FROM applications WHERE id = ?")
            .get(req.params.id),
    );
});

// Download cover letter (own or admin view)
router.get("/:id/cover-letter", (req, res) => {
    const existing = req.isAdmin
        ? db
              .prepare("SELECT * FROM applications WHERE id = ?")
              .get(req.params.id)
        : getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });
    if (!existing.cover_letter_path)
        return res.status(404).json({ error: "No cover letter uploaded" });

    const filePath = safePath(uploadsDir, existing.cover_letter_path);
    if (!filePath) return res.status(400).json({ error: "Invalid file path" });
    if (!fs.existsSync(filePath))
        return res.status(404).json({ error: "File not found" });

    if (req.isAdmin && existing.user_email !== req.userEmail) {
        console.info(
            "[admin] %s downloaded cover letter for app %s owned by %s",
            req.userEmail,
            req.params.id,
            existing.user_email,
        );
    }
    const clMime =
        MIME_MAP[path.extname(existing.cover_letter_filename).toLowerCase()] ||
        "application/octet-stream";
    res.setHeader("Content-Type", clMime);
    res.setHeader("Content-Disposition", "inline");
    res.sendFile(filePath);
});

// List attachments for an application (own or admin view)
router.get("/:id/attachments", (req, res) => {
    try {
        res.json(
            svc.listAttachments(req.userEmail, req.params.id, {
                isAdmin: req.isAdmin,
            }),
        );
    } catch (e) {
        handleError(res, e);
    }
});

// Upload attachments (owner only)
router.post("/:id/attachments", (req, res, next) => {
    upload.array("files", 10)(req, res, async (err) => {
        if (err) {
            return res.status(400).json({ error: err.message });
        }
        try {
            if (!req.files || req.files.length === 0)
                return res.status(400).json({ error: "No files uploaded" });
            const files = req.files.map((f) => ({
                originalname: f.originalname,
                buffer: fs.readFileSync(f.path),
            }));
            const inserted = await svc.uploadAttachments(
                req.userEmail,
                req.params.id,
                files,
            );
            // Clean up temp multer files
            req.files.forEach((f) => {
                try {
                    fs.unlinkSync(f.path);
                } catch {}
            });
            logAuditEvent({
                userEmail: req.userEmail,
                action: "upload_attachment",
                applicationId: parseInt(req.params.id, 10),
                source: "rest",
                authMethod: req.authMethod,
                details: { filenames: req.files.map((f) => f.originalname) },
            });
            res.status(201).json(inserted);
        } catch (e) {
            // Clean up temp multer files on error
            if (req.files)
                req.files.forEach((f) => {
                    try {
                        fs.unlinkSync(f.path);
                    } catch {}
                });
            handleError(res, e);
        }
    });
});

// Download a specific attachment (own or admin view)
// Admins can download attachments for any application (read-only). Files leave
// the server boundary — admin downloads are audit-logged via the line below.
router.get("/:id/attachments/:attachmentId", (req, res) => {
    try {
        const attachment = svc.getAttachment(
            req.userEmail,
            req.params.id,
            req.params.attachmentId,
            { isAdmin: req.isAdmin },
        );
        const filePath = safePath(uploadsDir, attachment.stored_filename);
        if (!filePath)
            return res.status(400).json({ error: "Invalid file path" });
        if (!fs.existsSync(filePath))
            return res.status(404).json({ error: "File not found" });
        if (req.isAdmin) {
            console.info(
                "[admin] %s downloaded attachment %s from app %s",
                req.userEmail,
                req.params.attachmentId,
                req.params.id,
            );
        }
        const mime =
            attachment.mime_type ||
            MIME_MAP[
                path.extname(attachment.original_filename).toLowerCase()
            ] ||
            "application/octet-stream";
        res.setHeader("Content-Type", mime);
        res.setHeader("Content-Disposition", "inline");
        res.sendFile(filePath);
    } catch (e) {
        handleError(res, e);
    }
});

// Get extracted text for a specific attachment (own or admin view)
router.get("/:id/attachments/:attachmentId/extracted-text", (req, res) => {
    try {
        const attachment = svc.getAttachment(
            req.userEmail,
            req.params.id,
            req.params.attachmentId,
            { isAdmin: req.isAdmin },
        );
        if (
            attachment.extracted_text === null ||
            attachment.extracted_text === undefined
        ) {
            return res.status(404).json({
                error: "No extracted text available for this attachment",
            });
        }
        res.json({
            text: attachment.extracted_text,
            extracted_at: attachment.extracted_at,
        });
    } catch (e) {
        handleError(res, e);
    }
});

// Delete a specific attachment (owner only)
router.delete("/:id/attachments/:attachmentId", (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const attachment = db
        .prepare(
            "SELECT * FROM attachments WHERE id = ? AND application_id = ?",
        )
        .get(req.params.attachmentId, req.params.id);
    if (!attachment)
        return res.status(404).json({ error: "Attachment not found" });

    const now = new Date().toISOString();
    db.prepare("DELETE FROM attachments WHERE id = ?").run(
        req.params.attachmentId,
    );
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        now,
        req.params.id,
    );

    const filePath = safePath(uploadsDir, attachment.stored_filename);
    if (filePath) safeDeleteFile(filePath);

    logAuditEvent({
        userEmail: req.userEmail,
        action: "delete_attachment",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: {
            attachment_id: parseInt(req.params.attachmentId, 10),
            filename: attachment.original_filename,
        },
    });

    res.json({ success: true });
});

// Update date fields (owner only)
router.patch("/:id/dates", (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const DATE_FIELDS = [
        "interested_at",
        "applied_at",
        "responded_at",
        "interview_at",
        "offer_at",
        "closed_at",
    ];
    const updates = [];
    const values = [];

    for (const field of DATE_FIELDS) {
        if (req.body[field] === undefined) continue;
        const val = req.body[field];
        if (val === null) {
            updates.push(`${field} = ?`);
            values.push(null);
        } else if (typeof val === "string" && !isNaN(Date.parse(val))) {
            updates.push(`${field} = ?`);
            values.push(val);
        } else {
            return res
                .status(400)
                .json({ error: `Invalid date value for ${field}` });
        }
    }

    if (updates.length === 0) {
        return res.status(400).json({ error: "No date fields to update" });
    }

    updates.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(req.params.id);
    values.push(req.userEmail);

    db.prepare(
        `UPDATE applications SET ${updates.join(", ")} WHERE id = ? AND user_email = ?`,
    ).run(...values);
    const row = db
        .prepare("SELECT * FROM applications WHERE id = ?")
        .get(req.params.id);

    logAuditEvent({
        userEmail: req.userEmail,
        action: "update_dates",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: {
            fields: DATE_FIELDS.filter((f) => req.body[f] !== undefined),
        },
    });

    res.json(attachNotes([row])[0]);
});

// Delete application (owner only — no admin bypass)
router.delete("/:id", (req, res) => {
    try {
        const appId = parseInt(req.params.id, 10);
        logAuditEvent({
            userEmail: req.userEmail,
            action: "delete_application",
            applicationId: appId,
            source: "rest",
            authMethod: req.authMethod,
            details: null,
        });
        res.json(svc.deleteApplication(req.userEmail, req.params.id));
    } catch (e) {
        handleError(res, e);
    }
});

// Create a stage note (owner only)
router.post("/:id/notes", (req, res) => {
    try {
        const result = svc.addNote(req.userEmail, req.params.id, req.body);
        logAuditEvent({
            userEmail: req.userEmail,
            action: "add_note",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: { stage: result.stage },
        });
        res.status(201).json(result);
    } catch (e) {
        handleError(res, e);
    }
});

// Update a stage note (owner only)
router.put("/:id/notes/:noteId", (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const note = db
        .prepare(
            "SELECT * FROM stage_notes WHERE id = ? AND application_id = ?",
        )
        .get(req.params.noteId, req.params.id);
    if (!note) return res.status(404).json({ error: "Note not found" });

    const { content, stage } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });
    if (content.length > 10000) {
        return res.status(400).json({
            error: "content exceeds maximum length of 10000 characters",
        });
    }

    const now = new Date().toISOString();
    const updates = ["content = ?", "updated_at = ?"];
    const values = [content, now];

    if (stage) {
        if (!VALID_STATUSES.includes(stage)) {
            return res.status(400).json({ error: "Invalid stage" });
        }
        updates.push("stage = ?");
        values.push(stage);
    }

    values.push(req.params.noteId);
    db.prepare(`UPDATE stage_notes SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
    );
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        now,
        req.params.id,
    );

    logAuditEvent({
        userEmail: req.userEmail,
        action: "update_note",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: {
            note_id: parseInt(req.params.noteId, 10),
            stage: stage || note.stage,
        },
    });

    res.json(
        db
            .prepare("SELECT * FROM stage_notes WHERE id = ?")
            .get(req.params.noteId),
    );
});

// Delete a stage note (owner only)
router.delete("/:id/notes/:noteId", (req, res) => {
    const existing = getOwnApp(req.params.id, req.userEmail);
    if (!existing) return res.status(404).json({ error: "Not found" });

    const note = db
        .prepare(
            "SELECT * FROM stage_notes WHERE id = ? AND application_id = ?",
        )
        .get(req.params.noteId, req.params.id);
    if (!note) return res.status(404).json({ error: "Note not found" });

    const now = new Date().toISOString();
    db.prepare("DELETE FROM stage_notes WHERE id = ?").run(req.params.noteId);
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        now,
        req.params.id,
    );

    logAuditEvent({
        userEmail: req.userEmail,
        action: "delete_note",
        applicationId: parseInt(req.params.id, 10),
        source: "rest",
        authMethod: req.authMethod,
        details: { note_id: parseInt(req.params.noteId, 10) },
    });

    res.json({ success: true });
});

// Extract structured data from existing job_description (owner or admin)
router.post("/:id/extract-jd", async (req, res) => {
    try {
        const existing = req.isAdmin
            ? db
                  .prepare("SELECT * FROM applications WHERE id = ?")
                  .get(req.params.id)
            : getOwnApp(req.params.id, req.userEmail);
        if (!existing) return res.status(404).json({ error: "Not found" });

        if (!existing.job_description || !existing.job_description.trim()) {
            return res.status(422).json({ error: "Job description is empty" });
        }

        if (req.isAdmin && existing.user_email !== req.userEmail) {
            console.info(
                "[admin] %s triggered JD extraction for app %s owned by %s",
                req.userEmail,
                req.params.id,
                existing.user_email,
            );
        }

        const extracted = await extractStructuredJD(existing.job_description);
        if (!extracted) {
            return res.status(502).json({
                error: "Extraction failed. The LLM service may be unavailable.",
            });
        }

        const now = new Date().toISOString();
        db.prepare(
            "UPDATE applications SET extracted_jd = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(extracted), now, req.params.id);

        logAuditEvent({
            userEmail: req.userEmail,
            action: "extract_job_description",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: {},
        });

        res.json({ extracted_jd: extracted });
    } catch (e) {
        handleError(res, e);
    }
});

// Fetch job description from URL and auto-extract (owner or admin)
router.post("/:id/fetch-jd", async (req, res) => {
    try {
        const existing = req.isAdmin
            ? db
                  .prepare("SELECT * FROM applications WHERE id = ?")
                  .get(req.params.id)
            : getOwnApp(req.params.id, req.userEmail);
        if (!existing) return res.status(404).json({ error: "Not found" });

        if (!existing.job_posting_url || !existing.job_posting_url.trim()) {
            return res.status(422).json({ error: "Job posting URL is empty" });
        }

        if (req.isAdmin && existing.user_email !== req.userEmail) {
            console.info(
                "[admin] %s triggered JD fetch for app %s owned by %s",
                req.userEmail,
                req.params.id,
                existing.user_email,
            );
        }

        let text;
        try {
            text = await fetchJobDescription(existing.job_posting_url);
        } catch (fetchErr) {
            if (fetchErr instanceof FetchError) {
                return res
                    .status(502)
                    .json({ error: fetchErr.message, type: fetchErr.type });
            }
            throw fetchErr;
        }

        const now = new Date().toISOString();
        db.prepare(
            "UPDATE applications SET job_description = ?, updated_at = ? WHERE id = ?",
        ).run(text, now, req.params.id);

        // Auto-trigger structured extraction
        const extracted = await extractStructuredJD(text);
        if (extracted) {
            db.prepare(
                "UPDATE applications SET extracted_jd = ? WHERE id = ?",
            ).run(JSON.stringify(extracted), req.params.id);
        }

        logAuditEvent({
            userEmail: req.userEmail,
            action: "fetch_job_description",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: {},
        });

        res.json({
            job_description: text,
            extracted_jd: extracted,
        });
    } catch (e) {
        handleError(res, e);
    }
});

// Generate a tailored document for an application (owner or admin)
router.post("/:id/generate", async (req, res) => {
    try {
        const existing = req.isAdmin
            ? db
                  .prepare("SELECT * FROM applications WHERE id = ?")
                  .get(req.params.id)
            : getOwnApp(req.params.id, req.userEmail);
        if (!existing) return res.status(404).json({ error: "Not found" });

        const task = req.body.task;
        if (!task || !VALID_TASKS.includes(task)) {
            return res.status(400).json({
                error: `Invalid task. Must be one of: ${VALID_TASKS.join(", ")}`,
            });
        }

        if (req.isAdmin && existing.user_email !== req.userEmail) {
            console.info(
                "[admin] %s triggered generation (%s) for app %s owned by %s",
                req.userEmail,
                task,
                req.params.id,
                existing.user_email,
            );
        }

        // Build context payload (same as GET /:id/context)
        const notes = db
            .prepare(
                "SELECT * FROM stage_notes WHERE application_id = ? ORDER BY created_at ASC",
            )
            .all(req.params.id);
        const attachments = db
            .prepare(
                "SELECT id, original_filename, stored_filename, file_size, mime_type, extracted_text, created_at FROM attachments WHERE application_id = ?",
            )
            .all(req.params.id);
        const profile = db
            .prepare("SELECT * FROM user_profiles WHERE user_email = ?")
            .get(existing.user_email);

        const context = {
            application: existing,
            notes,
            attachments,
            profile: profile || null,
            job_description: existing.job_description || null,
        };

        const generatedText = await generateDocument(context, task);

        // Store as a generated attachment
        const now = new Date().toISOString();
        const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const filename = `${task}_${unique}.md`;
        const filePath = path.join(uploadsDir, filename);
        fs.writeFileSync(filePath, generatedText, "utf-8");
        const fileSize = fs.statSync(filePath).size;

        const result = db
            .prepare(
                "INSERT INTO attachments (application_id, original_filename, stored_filename, file_size, mime_type, generated_by, generation_task) VALUES (?, ?, ?, ?, ?, ?, ?)",
            )
            .run(
                req.params.id,
                filename,
                filename,
                fileSize,
                "text/markdown",
                "agent",
                task,
            );

        db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
            now,
            req.params.id,
        );

        const attachment = db
            .prepare("SELECT * FROM attachments WHERE id = ?")
            .get(result.lastInsertRowid);

        logAuditEvent({
            userEmail: req.userEmail,
            action: "generate_document",
            applicationId: parseInt(req.params.id, 10),
            source: "rest",
            authMethod: req.authMethod,
            details: { task },
        });

        res.json({
            text: generatedText,
            attachment: {
                id: attachment.id,
                original_filename: attachment.original_filename,
                file_size: attachment.file_size,
                mime_type: attachment.mime_type,
                generated_by: attachment.generated_by,
                generation_task: attachment.generation_task,
                created_at: attachment.created_at,
            },
        });
    } catch (e) {
        handleError(res, e);
    }
});

module.exports = router;
