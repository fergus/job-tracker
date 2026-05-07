"use strict";
const db = require("../db");
const { ServiceError, VALID_STATUSES, getOwnApp } = require("./applications");

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

function updateNote(userEmail, appId, noteId, { content, stage }) {
    const existing = getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const note = db
        .prepare(
            "SELECT * FROM stage_notes WHERE id = ? AND application_id = ?",
        )
        .get(noteId, appId);
    if (!note) throw new ServiceError(404, "Note not found");

    if (!content) throw new ServiceError(400, "content is required");
    if (content.length > 10000) {
        throw new ServiceError(
            400,
            "content exceeds maximum length of 10000 characters",
        );
    }

    const now = new Date().toISOString();
    const updates = ["content = ?", "updated_at = ?"];
    const values = [content, now];

    if (stage) {
        if (!VALID_STATUSES.includes(stage)) {
            throw new ServiceError(400, "Invalid stage");
        }
        updates.push("stage = ?");
        values.push(stage);
    }

    values.push(noteId);
    db.prepare(`UPDATE stage_notes SET ${updates.join(", ")} WHERE id = ?`).run(
        ...values,
    );
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        now,
        appId,
    );

    return db.prepare("SELECT * FROM stage_notes WHERE id = ?").get(noteId);
}

function deleteNote(userEmail, appId, noteId) {
    const existing = getOwnApp(appId, userEmail);
    if (!existing) throw new ServiceError(404, "Not found");

    const note = db
        .prepare(
            "SELECT * FROM stage_notes WHERE id = ? AND application_id = ?",
        )
        .get(noteId, appId);
    if (!note) throw new ServiceError(404, "Note not found");

    const now = new Date().toISOString();
    db.prepare("DELETE FROM stage_notes WHERE id = ?").run(noteId);
    db.prepare("UPDATE applications SET updated_at = ? WHERE id = ?").run(
        now,
        appId,
    );

    return { success: true };
}

module.exports = { addNote, updateNote, deleteNote };
